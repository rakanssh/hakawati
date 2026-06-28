import { fetch } from "@tauri-apps/plugin-http";
import { nanoid } from "nanoid";
import { LogEntryRole } from "@/types/log.type";
import type {
  CatalogScenarioDetail,
  CatalogScenarioPage,
  CatalogSort,
  CatalogStartResponse,
  CoverAssetReference,
  ScenarioPackage,
} from "@/types/catalog.type";
import { GameMode, type Scenario } from "@/types/context.type";
import {
  buildScenarioPackage,
  catalogStartSourceToTaleSource,
  parseScenarioPackage,
  type ScenarioPackageMetadata,
} from "@/lib/catalog-package";
import { scenarioContentToTaleSeed } from "@/lib/scenario-content";
import { initTale } from "@/services/tale.service";
import {
  markNewTaleSyncPreference,
  type NewTaleSyncPolicy,
} from "@/services/new-tale-sync";
import {
  getScenarioPublishLink,
  upsertScenarioPublishLink,
} from "@/repositories/scenario-publish-link.repository";

export type CatalogCapabilities = {
  features?: Record<string, "enabled" | "disabled" | "unsupported" | string>;
  scenarioCatalog?: {
    packageFormatVersion?: number;
    thumbnailUploads?: "enabled" | "disabled" | "unsupported" | string;
  };
};

export type CatalogTransport = {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
};

export type CatalogTransportOptions = {
  baseUrl: string;
  accessToken?: string;
};

export type CatalogListOptions = {
  limit?: number;
  cursor?: string;
  sort?: CatalogSort;
  category?: string;
  language?: string;
  tag?: string[];
};

export type CatalogThumbnailUpload = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width?: number;
  height?: number;
};

export class CatalogHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = String(status),
  ) {
    super(message);
  }
}

function bodyValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function errorCode(value: unknown, status: number): string {
  const payload = bodyValue(value);
  return typeof payload.code === "string"
    ? payload.code
    : typeof payload.type === "string"
      ? payload.type
      : String(status);
}

function parseResponseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function catalogBaseUrl(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function createCatalogTransport({
  baseUrl,
  accessToken,
}: CatalogTransportOptions): CatalogTransport {
  const base = catalogBaseUrl(baseUrl);

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = parseResponseBody(text);
    if (!response.ok) {
      const payload = bodyValue(data);
      throw new CatalogHttpError(
        typeof payload.message === "string" ? payload.message : text,
        response.status,
        errorCode(data, response.status),
      );
    }
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
  };
}

export async function fetchCatalogCapabilities(
  transport: CatalogTransport,
): Promise<CatalogCapabilities> {
  return bodyValue(
    await transport.get("/v1/capabilities"),
  ) as CatalogCapabilities;
}

export function canUseScenarioCatalog(
  capabilities: CatalogCapabilities | null | undefined,
): boolean {
  return (
    capabilities?.features?.scenarioCatalog === "enabled" &&
    capabilities.scenarioCatalog?.packageFormatVersion === 1
  );
}

export function canUploadCatalogThumbnails(
  capabilities: CatalogCapabilities | null | undefined,
): boolean {
  return (
    canUseScenarioCatalog(capabilities) &&
    capabilities?.scenarioCatalog?.thumbnailUploads === "enabled"
  );
}

export async function listCatalogScenarios(
  transport: CatalogTransport,
  options: CatalogListOptions = {},
): Promise<CatalogScenarioPage> {
  const query = catalogListQuery(options);
  const suffix = query ? `?${query}` : "";
  return bodyValue(
    await transport.get(`/v1/catalog/scenarios${suffix}`),
  ) as CatalogScenarioPage;
}

export async function listOwnedCatalogScenarios(
  transport: CatalogTransport,
  options: Pick<CatalogListOptions, "limit" | "cursor"> = {},
): Promise<CatalogScenarioPage> {
  const query = catalogListQuery(options);
  const suffix = query ? `?${query}` : "";
  return bodyValue(
    await transport.get(`/v1/catalog/me/scenarios${suffix}`),
  ) as CatalogScenarioPage;
}

export async function getCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
): Promise<CatalogScenarioDetail> {
  const detail = bodyValue(
    await transport.get(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}`,
    ),
  ) as CatalogScenarioDetail;
  return {
    ...detail,
    package: parseScenarioPackage(detail.package),
  };
}

export async function startCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
  options: { syncPolicy?: NewTaleSyncPolicy } = {},
): Promise<string> {
  const response = bodyValue(
    await transport.post(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}/start`,
      {},
    ),
  ) as CatalogStartResponse;
  const pkg = parseScenarioPackage(response.package);
  const seed = scenarioContentToTaleSeed(pkg.scenario.content);
  const taleId = await initTale({
    source: catalogStartSourceToTaleSource(response.source),
    name: pkg.scenario.title,
    description: pkg.scenario.summary,
    thumbnail: null,
    components: seed.components,
    storyCards: seed.storyCards,
    stats: seed.stats,
    inventory: seed.inventory,
    log: seed.openingText
      ? [{ id: nanoid(12), text: seed.openingText, role: LogEntryRole.GM }]
      : [],
    gameMode:
      pkg.scenario.initialGameMode === GameMode.GM
        ? GameMode.GM
        : GameMode.STORY_TELLER,
    undoStack: [],
  });
  await markNewTaleSyncPreference(taleId, options.syncPolicy);
  return taleId;
}

export async function createCatalogScenario(
  transport: CatalogTransport,
  input: { package: ScenarioPackage; thumbnailAssetId?: string | null },
): Promise<CatalogScenarioDetail> {
  return bodyValue(
    await transport.post("/v1/catalog/scenarios", {
      package: input.package,
      ...(input.thumbnailAssetId !== undefined
        ? { thumbnailAssetId: input.thumbnailAssetId }
        : {}),
    }),
  ) as CatalogScenarioDetail;
}

export async function publishCatalogScenarioVersion(
  transport: CatalogTransport,
  scenarioId: string,
  input: { package: ScenarioPackage; thumbnailAssetId?: string | null },
): Promise<CatalogScenarioDetail> {
  return bodyValue(
    await transport.post(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}/versions`,
      {
        package: input.package,
        ...(input.thumbnailAssetId !== undefined
          ? { thumbnailAssetId: input.thumbnailAssetId }
          : {}),
      },
    ),
  ) as CatalogScenarioDetail;
}

export async function updateCatalogScenarioMetadata(
  transport: CatalogTransport,
  scenarioId: string,
  input: { thumbnailAssetId: string | null },
): Promise<CatalogScenarioDetail> {
  return bodyValue(
    await transport.patch(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}`,
      input,
    ),
  ) as CatalogScenarioDetail;
}

export async function unpublishCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
): Promise<{ id: string; status: string }> {
  return bodyValue(
    await transport.post(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}/unpublish`,
      {},
    ),
  ) as { id: string; status: string };
}

export async function reportCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
  input: { reason: string; details?: string | null },
): Promise<{ id: string; status: string }> {
  return bodyValue(
    await transport.post(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}/reports`,
      input,
    ),
  ) as { id: string; status: string };
}

export async function publishScenarioDraft(input: {
  transport: CatalogTransport;
  localScenarioId: string;
  scenario: Scenario;
  metadata: ScenarioPackageMetadata;
  thumbnailAssetId?: string | null;
}): Promise<CatalogScenarioDetail> {
  const pkg = buildScenarioPackage(input.scenario, input.metadata);
  const link = await getScenarioPublishLink(input.localScenarioId);
  const detail = link
    ? await publishCatalogScenarioVersion(
        input.transport,
        link.catalogScenarioId,
        {
          package: pkg,
          ...(input.thumbnailAssetId !== undefined
            ? { thumbnailAssetId: input.thumbnailAssetId }
            : {}),
        },
      )
    : await createCatalogScenario(input.transport, {
        package: pkg,
        ...(input.thumbnailAssetId !== undefined
          ? { thumbnailAssetId: input.thumbnailAssetId }
          : {}),
      });

  await upsertScenarioPublishLink({
    localScenarioId: input.localScenarioId,
    catalogScenarioId: detail.id,
    catalogScenarioVersionId: detail.currentVersionId,
  });
  return detail;
}

export async function uploadPublicCatalogThumbnail(
  transport: CatalogTransport,
  thumbnail: CatalogThumbnailUpload,
): Promise<CoverAssetReference> {
  const intent = bodyValue(
    await transport.post("/v1/assets/cover-upload-intents", {
      visibility: "public",
      contentType: thumbnail.contentType,
      byteSize: thumbnail.bytes.byteLength,
      sha256: await sha256Hex(thumbnail.bytes),
      ...(thumbnail.width ? { width: thumbnail.width } : {}),
      ...(thumbnail.height ? { height: thumbnail.height } : {}),
    }),
  );
  const asset = bodyValue(intent.asset) as CoverAssetReference;
  const upload = bodyValue(intent.upload);
  const assetId = typeof asset.assetId === "string" ? asset.assetId : null;
  const uploadUrl = typeof upload.url === "string" ? upload.url : null;
  const uploadMethod =
    typeof upload.method === "string" ? upload.method : "PUT";
  const uploadHeaders = bodyValue(upload.headers) as Record<string, string>;
  if (!assetId || !uploadUrl) {
    throw new Error("Thumbnail upload intent did not include upload details");
  }

  const response = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: uploadHeaders,
    body: new Blob([thumbnail.bytes.slice().buffer], {
      type: thumbnail.contentType,
    }),
  });
  if (!response.ok) {
    throw new CatalogHttpError(
      "Thumbnail upload failed",
      response.status,
      "thumbnail_upload_failed",
    );
  }

  const completed = bodyValue(
    await transport.post(
      `/v1/assets/${encodeURIComponent(assetId)}/complete`,
      {},
    ),
  );
  return bodyValue(completed.asset) as CoverAssetReference;
}

function catalogListQuery(options: CatalogListOptions): string {
  const query = new URLSearchParams();
  if (options.limit) query.set("limit", String(options.limit));
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.sort) query.set("sort", options.sort);
  if (options.category) query.set("category", options.category);
  if (options.language) query.set("language", options.language);
  for (const tag of options.tag ?? []) query.append("tag", tag);
  return query.toString();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice() as BufferSource,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
