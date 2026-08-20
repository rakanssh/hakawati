import { fetch } from "@tauri-apps/plugin-http";
import { nanoid } from "nanoid";
import {
  asApiObject,
  parseApiError,
  parseApiResponseBody,
} from "@/services/api-error";
import { LogEntryRole } from "@/types/log.type";
import type {
  CatalogOwnedScenarioDetail,
  CatalogOwnedScenarioPage,
  CatalogScenarioDetail,
  CatalogScenarioPage,
  CatalogSort,
  CatalogTagSort,
  CatalogTagSuggestionPage,
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
import { normalizeCatalogTags } from "@/lib/catalog-tags";
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
import {
  cloudFeatureAvailable,
  HAKAWATI_CLIENT_HEADERS,
  parseCloudCapabilities,
  type CloudCapabilities,
} from "@/services/cloud-capabilities";

export type CatalogCapabilities = CloudCapabilities;

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
  tag?: string[];
};

export type CatalogTagListOptions = {
  q?: string;
  tag?: string[];
  sort?: CatalogTagSort;
  limit?: number;
};

export type CatalogThumbnailUpload = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width?: number;
  height?: number;
};

export type CatalogPolicyKey = "terms" | "privacy" | "community_guidelines";

export type CatalogPolicy = {
  key: CatalogPolicyKey;
  version: string;
  url: string;
  requiredForPublishing: boolean;
};

export type CatalogCurrentPolicies = {
  policies: CatalogPolicy[];
  publishingRequires: CatalogPolicyKey[];
};

export type CatalogPublishingAcceptance = {
  termsVersion: string;
  communityGuidelinesVersion: string;
};

export class CatalogHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = String(status),
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

const bodyValue = asApiObject;

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
        ...HAKAWATI_CLIENT_HEADERS,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = parseApiResponseBody(text);
    if (!response.ok) {
      const error = parseApiError(data, response.status, text);
      throw new CatalogHttpError(
        error.message,
        response.status,
        error.code,
        error.details,
        error.requestId,
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

export async function fetchCurrentCatalogPolicies(
  transport: CatalogTransport,
): Promise<CatalogCurrentPolicies> {
  const value = bodyValue(await transport.get("/v1/policies/current"));
  const policies = Array.isArray(value.policies)
    ? value.policies.map(parseCatalogPolicy)
    : [];
  const publishingRequires = Array.isArray(value.publishingRequires)
    ? value.publishingRequires.filter(isCatalogPolicyKey)
    : [];
  if (policies.length === 0 || publishingRequires.length === 0) {
    throw new CatalogHttpError(
      "The server returned an invalid publishing policy contract.",
      503,
      "policies_invalid",
    );
  }
  const current = { policies, publishingRequires };
  publishingAcceptanceFor(current);
  return current;
}

export function publishingAcceptanceFor(
  current: CatalogCurrentPolicies,
): CatalogPublishingAcceptance {
  const terms = current.policies.find((policy) => policy.key === "terms");
  const communityGuidelines = current.policies.find(
    (policy) => policy.key === "community_guidelines",
  );
  if (!terms || !communityGuidelines) {
    throw new CatalogHttpError(
      "The publishing policies are incomplete.",
      503,
      "policies_invalid",
    );
  }
  return {
    termsVersion: terms.version,
    communityGuidelinesVersion: communityGuidelines.version,
  };
}

export async function acceptCurrentCatalogPolicies(
  transport: CatalogTransport,
  acceptance: CatalogPublishingAcceptance,
): Promise<void> {
  await transport.post("/v1/policy-acceptances", acceptance);
}

export async function fetchCatalogCapabilities(
  transport: CatalogTransport,
): Promise<CatalogCapabilities> {
  const capabilities = parseCloudCapabilities(
    bodyValue(await transport.get("/v1/capabilities")),
  );
  if (!capabilities) {
    throw new CatalogHttpError(
      "The cloud server returned an invalid compatibility contract.",
      503,
      "capabilities_invalid",
    );
  }
  return capabilities;
}

export function canUseScenarioCatalog(
  capabilities: CatalogCapabilities | null | undefined,
): boolean {
  return (
    cloudFeatureAvailable(capabilities, "catalogRead") &&
    capabilities?.scenarioCatalog.packageFormatVersion === 1
  );
}

export function canPublishScenarioCatalog(
  capabilities: CatalogCapabilities | null | undefined,
): boolean {
  return (
    canUseScenarioCatalog(capabilities) &&
    cloudFeatureAvailable(capabilities, "publishing")
  );
}

export function canUploadCatalogThumbnails(
  capabilities: CatalogCapabilities | null | undefined,
): boolean {
  return (
    canUseScenarioCatalog(capabilities) &&
    cloudFeatureAvailable(capabilities, "coverStorage") &&
    capabilities?.scenarioCatalog.thumbnailUploads === "enabled"
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
  options: CatalogListOptions = {},
): Promise<CatalogOwnedScenarioPage> {
  const query = catalogListQuery(options);
  const suffix = query ? `?${query}` : "";
  return bodyValue(
    await transport.get(`/v1/catalog/me/scenarios${suffix}`),
  ) as CatalogOwnedScenarioPage;
}

export async function listCatalogTags(
  transport: CatalogTransport,
  options: CatalogTagListOptions = {},
): Promise<CatalogTagSuggestionPage> {
  const query = catalogTagQuery(options);
  const suffix = query ? `?${query}` : "";
  return bodyValue(
    await transport.get(`/v1/catalog/tags${suffix}`),
  ) as CatalogTagSuggestionPage;
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

export async function getOwnedCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
): Promise<CatalogOwnedScenarioDetail> {
  const detail = bodyValue(
    await transport.get(
      `/v1/catalog/me/scenarios/${encodeURIComponent(scenarioId)}`,
    ),
  ) as CatalogOwnedScenarioDetail;
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
): Promise<CatalogOwnedScenarioDetail> {
  return bodyValue(
    await transport.post("/v1/catalog/scenarios", {
      package: input.package,
      ...(input.thumbnailAssetId !== undefined
        ? { thumbnailAssetId: input.thumbnailAssetId }
        : {}),
    }),
  ) as CatalogOwnedScenarioDetail;
}

export async function publishCatalogScenarioVersion(
  transport: CatalogTransport,
  scenarioId: string,
  input: { package: ScenarioPackage; thumbnailAssetId?: string | null },
): Promise<CatalogOwnedScenarioDetail> {
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
  ) as CatalogOwnedScenarioDetail;
}

export async function updateCatalogScenarioMetadata(
  transport: CatalogTransport,
  scenarioId: string,
  input: { thumbnailAssetId: string | null },
): Promise<CatalogOwnedScenarioDetail> {
  return bodyValue(
    await transport.patch(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}`,
      input,
    ),
  ) as CatalogOwnedScenarioDetail;
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

export async function blockCatalogPublisher(
  transport: CatalogTransport,
  publisherId: string,
): Promise<{ publisherId: string; blocked: true }> {
  return bodyValue(
    await transport.post(
      `/v1/catalog/publishers/${encodeURIComponent(publisherId)}/block`,
      {},
    ),
  ) as { publisherId: string; blocked: true };
}

function isCatalogPolicyKey(value: unknown): value is CatalogPolicyKey {
  return (
    value === "terms" || value === "privacy" || value === "community_guidelines"
  );
}

function parseCatalogPolicy(value: unknown): CatalogPolicy {
  const policy = bodyValue(value);
  if (
    !isCatalogPolicyKey(policy.key) ||
    typeof policy.version !== "string" ||
    !policy.version.trim() ||
    typeof policy.url !== "string" ||
    !policy.url.trim() ||
    typeof policy.requiredForPublishing !== "boolean"
  ) {
    throw new CatalogHttpError(
      "The server returned an invalid publishing policy.",
      503,
      "policies_invalid",
    );
  }
  return {
    key: policy.key,
    version: policy.version,
    url: policy.url,
    requiredForPublishing: policy.requiredForPublishing,
  };
}

export async function publishScenarioDraft(input: {
  transport: CatalogTransport;
  localScenarioId: string;
  scenario: Scenario;
  metadata: ScenarioPackageMetadata;
  thumbnailAssetId?: string | null;
}): Promise<CatalogOwnedScenarioDetail> {
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
  for (const tag of normalizeCatalogTags(options.tag)) query.append("tag", tag);
  return query.toString();
}

function catalogTagQuery(options: CatalogTagListOptions): string {
  const query = new URLSearchParams();
  if (options.q?.trim()) query.set("q", options.q.trim());
  if (options.sort) query.set("sort", options.sort);
  if (options.limit) query.set("limit", String(options.limit));
  for (const tag of normalizeCatalogTags(options.tag)) query.append("tag", tag);
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
