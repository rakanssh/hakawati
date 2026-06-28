import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canUploadCatalogThumbnails,
  canUseScenarioCatalog,
  createCatalogTransport,
  fetchCatalogCapabilities,
  getCatalogScenario,
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
  type CatalogTagListOptions,
  type CatalogTransport,
} from "@/services/catalog.service";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import type {
  CatalogScenarioRecord,
  CatalogTagSuggestion,
} from "@/types/catalog.type";
import type { Scenario } from "@/types/context.type";
import type { ScenarioPackageMetadata } from "@/lib/catalog-package";
import { listScenarioPublishLinks } from "@/repositories/scenario-publish-link.repository";
import type { ScenarioPublishLink } from "@/types/catalog.type";
import type { NewTaleSyncPolicy } from "@/services/new-tale-sync";

export type CatalogClientState = {
  baseUrl: string;
  signedIn: boolean;
  enabled: boolean;
  thumbnailUploads: boolean;
  loading: boolean;
  error: unknown;
  capabilities: CatalogCapabilities | null;
  publicTransport: CatalogTransport | null;
  authTransport: CatalogTransport | null;
  refreshCapabilities: () => Promise<void>;
};

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
) {
  const [items, setItems] = useState<CatalogScenarioRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogListOptions>({
    limit: initial.limit ?? 24,
    sort: initial.sort ?? "popular",
    language: initial.language,
    ageRating: initial.ageRating,
    tag: initial.tag,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!client.enabled || !client.publicTransport) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await listCatalogScenarios(client.publicTransport, filters);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err);
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [client.enabled, client.publicTransport, filters]);

  const loadMore = useCallback(async () => {
    if (!client.enabled || !client.publicTransport || !nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listCatalogScenarios(client.publicTransport, {
        ...filters,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [client.enabled, client.publicTransport, filters, nextCursor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    nextCursor,
    filters,
    setFilters,
    loading,
    error,
    refresh,
    loadMore,
  } as const;
}

export function usePublishedCatalogScenarios(client: CatalogClientState) {
  const [items, setItems] = useState<CatalogScenarioRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!client.enabled || !client.authTransport) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await listOwnedCatalogScenarios(client.authTransport);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err);
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [client.authTransport, client.enabled]);

  const loadMore = useCallback(async () => {
    if (!client.enabled || !client.authTransport || !nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listOwnedCatalogScenarios(client.authTransport, {
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [client.authTransport, client.enabled, nextCursor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, nextCursor, loading, error, refresh, loadMore } as const;
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
  const { ageRating, language, limit, q, sort, tag } = options;
  const [items, setItems] = useState<CatalogTagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client.enabled || !client.publicTransport) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listCatalogTags(client.publicTransport, {
      ageRating,
      language,
      limit,
      q,
      sort,
      tag,
    })
      .then((page) => {
        if (!cancelled) setItems(page.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client.enabled,
    client.publicTransport,
    ageRating,
    language,
    limit,
    q,
    sort,
    tag,
  ]);

  return { items, loading } as const;
}

export function useCatalogActions(client: CatalogClientState) {
  const view = useCallback(
    async (scenarioId: string) => {
      if (!client.publicTransport) throw new Error("Catalog is not configured");
      return getCatalogScenario(client.publicTransport, scenarioId);
    },
    [client.publicTransport],
  );

  const start = useCallback(
    async (scenarioId: string, syncPolicy?: NewTaleSyncPolicy) => {
      if (!client.publicTransport) throw new Error("Catalog is not configured");
      return startCatalogScenario(client.publicTransport, scenarioId, {
        syncPolicy,
      });
    },
    [client.publicTransport],
  );

  const publish = useCallback(
    async (input: {
      scenario: Scenario;
      metadata: ScenarioPackageMetadata;
      thumbnailFile?: File | null;
    }) => {
      if (!client.authTransport)
        throw new Error("Sign in to publish scenarios");
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
    [client.authTransport, client.thumbnailUploads],
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

  return { view, start, publish, updateThumbnail, unpublish, report } as const;
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
