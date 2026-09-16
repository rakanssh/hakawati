import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptCurrentCatalogPolicies,
  blockCatalogPublisher,
  canUploadCatalogThumbnails,
  canPublishScenarioCatalog,
  canUseScenarioCatalog,
  createCatalogTransport,
  fetchCatalogCapabilities,
  getCatalogScenario,
  getOwnedCatalogScenario,
  listCatalogTags,
  listCatalogScenarios,
  listOwnedCatalogScenarios,
  publishScenarioDraft,
  reportCatalogScenario,
  startCatalogScenario,
  unpublishCatalogScenario,
  updateCatalogScenarioMetadata,
  uploadPublicCatalogThumbnail,
  type CatalogCapabilities,
  type CatalogListOptions,
  type CatalogPublishingAcceptance,
  type CatalogTagListOptions,
  type CatalogTransport,
} from "@/services/catalog.service";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import type {
  CatalogOwnedScenarioRecord,
  CatalogScenarioRecord,
  CatalogTagSuggestion,
} from "@/types/catalog.type";
import type { Scenario } from "@/types/context.type";
import type { ScenarioPackageMetadata } from "@/lib/catalog-package";
import { normalizeCatalogTags } from "@/lib/catalog-tags";
import { listScenarioPublishLinks } from "@/repositories/scenario-publish-link.repository";
import type { ScenarioPublishLink } from "@/types/catalog.type";
import type { NewTaleSyncPolicy } from "@/services/new-tale-sync";

export type CatalogClientState = {
  baseUrl: string;
  signedIn: boolean;
  enabled: boolean;
  publishingEnabled: boolean;
  thumbnailUploads: boolean;
  loading: boolean;
  error: unknown;
  capabilities: CatalogCapabilities | null;
  publicTransport: CatalogTransport | null;
  authTransport: CatalogTransport | null;
  refreshCapabilities: () => Promise<void>;
};

export function selectCatalogReadTransport(
  client: Pick<CatalogClientState, "authTransport" | "publicTransport">,
) {
  return client.authTransport ?? client.publicTransport;
}

export function useCatalogClient(): CatalogClientState {
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const accountId = useSyncSettingsStore((state) => state.accountId);
  const baseUrl = cloudBaseUrl.trim();
  const tokenExpired =
    accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
  const token = accessToken.trim();
  const signedIn = Boolean(accountId && token && !tokenExpired);
  const publicTransport = useMemo(
    () => (baseUrl ? createCatalogTransport({ baseUrl }) : null),
    [baseUrl],
  );
  const authTransport = useMemo(
    () =>
      baseUrl && signedIn
        ? createCatalogTransport({ baseUrl, accessToken: token })
        : null,
    [baseUrl, signedIn, token],
  );
  const [capabilities, setCapabilities] = useState<CatalogCapabilities | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refreshCapabilities = useCallback(async () => {
    if (!publicTransport) {
      setCapabilities(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCapabilities(await fetchCatalogCapabilities(publicTransport));
    } catch (err) {
      setCapabilities(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [publicTransport]);

  useEffect(() => {
    void refreshCapabilities();
  }, [refreshCapabilities]);

  return {
    baseUrl,
    signedIn,
    enabled: Boolean(baseUrl && canUseScenarioCatalog(capabilities)),
    publishingEnabled: Boolean(
      baseUrl && canPublishScenarioCatalog(capabilities),
    ),
    thumbnailUploads: canUploadCatalogThumbnails(capabilities),
    loading,
    error,
    capabilities,
    publicTransport,
    authTransport,
    refreshCapabilities,
  };
}

export function useCatalogScenarioList(
  client: CatalogClientState,
  initial: CatalogListOptions = {},
  controlledFilters?: CatalogListOptions,
) {
  return useCatalogList<CatalogScenarioRecord>(
    client.enabled,
    selectCatalogReadTransport(client),
    { ...initial, sort: initial.sort ?? "newest" },
    listCatalogScenarios,
    controlledFilters,
  );
}

export function usePublishedCatalogScenarios(
  client: CatalogClientState,
  initial: CatalogListOptions = {},
  controlledFilters?: CatalogListOptions,
) {
  return useCatalogList<CatalogOwnedScenarioRecord>(
    client.enabled,
    client.authTransport,
    { ...initial, sort: initial.sort ?? "updated" },
    listOwnedCatalogScenarios,
    controlledFilters,
  );
}

function useCatalogList<T extends { id: string }>(
  enabled: boolean,
  transport: CatalogTransport | null,
  initial: CatalogListOptions,
  list: (
    transport: CatalogTransport,
    options: CatalogListOptions,
  ) => Promise<{ items: T[]; nextCursor: string | null }>,
  controlledFilters?: CatalogListOptions,
) {
  const [internalFilters, setFilters] = useState<CatalogListOptions>(() => ({
    limit: initial.limit ?? 24,
    sort: initial.sort,
    q: initial.q,
    tag: initial.tag,
  }));
  const filters = controlledFilters ?? internalFilters;
  const { limit, sort } = filters;
  const q = filters.q?.trim() || undefined;
  const tagsKey = JSON.stringify(normalizeCatalogTags(filters.tag));
  const query = useMemo(
    () => ({ limit, sort, q, tag: JSON.parse(tagsKey) as string[] }),
    [limit, sort, q, tagsKey],
  );
  const scope = useMemo(
    () => ({ enabled, transport, query }),
    [enabled, transport, query],
  );
  const activeScope = useRef(scope);
  // Guard responses and old callbacks as soon as a new filter/auth render starts.
  activeScope.current = scope;
  const generation = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paging = useRef<{
    scope: typeof scope;
    cursor: string | null;
    busy: boolean;
  } | null>(null);
  const [state, setState] = useState({
    scope,
    items: [] as T[],
    nextCursor: null as string | null,
    loading: Boolean(enabled && transport),
    error: null as unknown,
  });

  const requestPage = useCallback(
    async (append: boolean) => {
      if (activeScope.current !== scope) return;
      const cursor =
        paging.current?.scope === scope ? paging.current.cursor : null;
      if (append && (!cursor || paging.current?.busy)) return;
      const request = ++generation.current;
      const available = Boolean(scope.enabled && scope.transport);
      const pageRequest = {
        scope,
        cursor: append ? cursor : null,
        busy: available,
      };
      paging.current = pageRequest;
      setState((current) => ({
        scope,
        items: append && current.scope === scope ? current.items : [],
        nextCursor: append ? cursor : null,
        loading: available,
        error: null,
      }));
      if (!scope.enabled || !scope.transport) return;
      const isCurrent = () =>
        activeScope.current === scope && generation.current === request;
      try {
        const page = await list(scope.transport, {
          ...scope.query,
          ...(append && cursor ? { cursor } : {}),
        });
        if (!isCurrent()) return;
        pageRequest.cursor = page.nextCursor;
        setState((current) => {
          const items = append ? [...current.items, ...page.items] : page.items;
          const seen = new Set<string>();
          return {
            ...current,
            items: items.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            }),
            nextCursor: page.nextCursor,
          };
        });
      } catch (error) {
        if (isCurrent()) setState((current) => ({ ...current, error }));
      } finally {
        if (isCurrent()) {
          pageRequest.busy = false;
          setState((current) => ({ ...current, loading: false }));
        }
      }
    },
    [list, scope],
  );
  const refresh = useCallback(() => {
    if (activeScope.current !== scope) return Promise.resolve();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    return requestPage(false);
  }, [requestPage, scope]);
  const loadMore = useCallback(() => requestPage(true), [requestPage]);

  useEffect(() => {
    refreshTimer.current = setTimeout(() => void refresh(), 200);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      generation.current += 1;
      paging.current = null;
    };
  }, [refresh]);

  return {
    items: state.scope === scope ? state.items : [],
    nextCursor: state.scope === scope ? state.nextCursor : null,
    filters,
    setFilters,
    loading:
      state.scope === scope ? state.loading : Boolean(enabled && transport),
    error: state.scope === scope ? state.error : null,
    refresh,
    loadMore,
  } as const;
}

export function useScenarioPublishLinks() {
  const [links, setLinks] = useState<ScenarioPublishLink[]>([]);

  const refresh = useCallback(async () => {
    setLinks(await listScenarioPublishLinks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { links, refresh } as const;
}

export function useCatalogTagSuggestions(
  client: CatalogClientState,
  options: CatalogTagListOptions,
) {
  const readTransport = selectCatalogReadTransport(client);
  const { limit, sort } = options;
  const q = options.q?.trim();
  const search = options.search?.trim();
  const tagsKey = JSON.stringify(normalizeCatalogTags(options.tag));
  const scope = useMemo(
    () => ({
      enabled: client.enabled,
      readTransport,
      limit,
      q,
      search,
      sort,
      tagsKey,
    }),
    [client.enabled, readTransport, limit, q, search, sort, tagsKey],
  );
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [state, setState] = useState({
    scope,
    items: [] as CatalogTagSuggestion[],
    loading: Boolean(client.enabled && readTransport),
  });

  useEffect(() => {
    if (!scope.enabled || !scope.readTransport) {
      setState({ scope, items: [], loading: false });
      return;
    }
    let cancelled = false;
    const isCurrent = () => !cancelled && activeScope.current === scope;
    setState({ scope, items: [], loading: true });
    const timer = setTimeout(() => {
      void listCatalogTags(scope.readTransport!, {
        limit: scope.limit,
        q: scope.q,
        search: scope.search,
        sort: scope.sort,
        tag: JSON.parse(scope.tagsKey) as string[],
      })
        .then((page) => {
          if (isCurrent())
            setState({ scope, items: page.items, loading: false });
        })
        .catch(() => {
          if (isCurrent()) setState({ scope, items: [], loading: false });
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scope]);

  return {
    items: state.scope === scope ? state.items : [],
    loading:
      state.scope === scope
        ? state.loading
        : Boolean(client.enabled && readTransport),
  } as const;
}

export function useCatalogActions(client: CatalogClientState) {
  const readTransport = selectCatalogReadTransport(client);

  const view = useCallback(
    async (scenarioId: string) => {
      if (!readTransport) throw new Error("Catalog is not configured");
      return getCatalogScenario(readTransport, scenarioId);
    },
    [readTransport],
  );

  const viewOwned = useCallback(
    async (scenarioId: string) => {
      if (!client.authTransport) throw new Error("Sign in to view scenarios");
      return getOwnedCatalogScenario(client.authTransport, scenarioId);
    },
    [client.authTransport],
  );

  const start = useCallback(
    async (scenarioId: string, syncPolicy?: NewTaleSyncPolicy) => {
      if (!readTransport) throw new Error("Catalog is not configured");
      return startCatalogScenario(readTransport, scenarioId, {
        syncPolicy,
      });
    },
    [readTransport],
  );

  const publish = useCallback(
    async (input: {
      scenario: Scenario;
      metadata: ScenarioPackageMetadata;
      thumbnailFile?: File | null;
      policyAcceptance: CatalogPublishingAcceptance;
    }) => {
      if (!client.authTransport)
        throw new Error("Sign in to publish scenarios");
      if (!client.publishingEnabled)
        throw new Error("Publishing is currently unavailable");
      await acceptCurrentCatalogPolicies(
        client.authTransport,
        input.policyAcceptance,
      );
      const thumbnailAssetId =
        input.thumbnailFile && client.thumbnailUploads
          ? (
              await uploadPublicCatalogThumbnail(
                client.authTransport,
                await fileToCatalogThumbnail(input.thumbnailFile),
              )
            ).assetId
          : undefined;
      return publishScenarioDraft({
        transport: client.authTransport,
        localScenarioId: input.scenario.id,
        scenario: input.scenario,
        metadata: input.metadata,
        ...(thumbnailAssetId ? { thumbnailAssetId } : {}),
      });
    },
    [client.authTransport, client.publishingEnabled, client.thumbnailUploads],
  );

  const updateThumbnail = useCallback(
    async (scenarioId: string, thumbnailFile: File | null) => {
      if (!client.authTransport) throw new Error("Sign in to update scenarios");
      const thumbnailAssetId = thumbnailFile
        ? (
            await uploadPublicCatalogThumbnail(
              client.authTransport,
              await fileToCatalogThumbnail(thumbnailFile),
            )
          ).assetId
        : null;
      return updateCatalogScenarioMetadata(client.authTransport, scenarioId, {
        thumbnailAssetId,
      });
    },
    [client.authTransport],
  );

  const unpublish = useCallback(
    async (scenarioId: string) => {
      if (!client.authTransport)
        throw new Error("Sign in to unpublish scenarios");
      return unpublishCatalogScenario(client.authTransport, scenarioId);
    },
    [client.authTransport],
  );

  const report = useCallback(
    async (scenarioId: string, reason: string, details?: string | null) => {
      const transport = client.authTransport ?? client.publicTransport;
      if (!transport) throw new Error("Catalog is not configured");
      return reportCatalogScenario(transport, scenarioId, {
        reason,
        details,
      });
    },
    [client.authTransport, client.publicTransport],
  );

  const blockPublisher = useCallback(
    async (publisherId: string) => {
      if (!client.authTransport) throw new Error("Sign in to block publishers");
      return blockCatalogPublisher(client.authTransport, publisherId);
    },
    [client.authTransport],
  );

  return {
    view,
    viewOwned,
    start,
    publish,
    updateThumbnail,
    unpublish,
    report,
    blockPublisher,
  } as const;
}

async function fileToCatalogThumbnail(file: File) {
  if (
    file.type !== "image/jpeg" &&
    file.type !== "image/png" &&
    file.type !== "image/webp"
  ) {
    throw new Error("Use a JPEG, PNG, or WebP thumbnail");
  }
  const contentType = file.type as "image/jpeg" | "image/png" | "image/webp";
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType,
  };
}
