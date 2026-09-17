import { fetch } from "@tauri-apps/plugin-http";
import { nanoid } from "nanoid";
import { ZodError } from "zod";
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
import {
  detectCoverImageContentType,
  optimizeCoverImage,
  sha256Hex,
} from "@/lib/cover-image";
import { scenarioContentToTaleSeed } from "@/lib/scenario-content";
import {
  assertValidScenarioQuestions,
  resolveScenarioQuestions,
  type ScenarioAnswers,
} from "@/lib/scenario-questions";
import { initTale } from "@/services/tale.service";
import {
  markNewTaleSyncPreference,
  type NewTaleSyncPolicy,
} from "@/services/new-tale-sync";
import {
  getScenarioPublishLink,
  getScenarioDraftCoverState,
  initializeScenarioDraftCover,
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
  q?: string;
  sort?: CatalogSort;
  tag?: string[];
};

export type CatalogTagListOptions = {
  q?: string;
  search?: string;
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

export type CatalogScenarioStartOptions = {
  syncPolicy?: NewTaleSyncPolicy;
  answers?: ScenarioAnswers;
  scenarioSnapshot?: CatalogScenarioDetail;
  expectedVersionId?: string;
};

function resolveScenarioPackage(
  pkg: ScenarioPackage,
  answers?: ScenarioAnswers,
) {
  const content = resolveScenarioQuestions(pkg.scenario.content, answers);
  try {
    return parseScenarioPackage({
      ...pkg,
      scenario: { ...pkg.scenario, content },
    });
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new Error(
      error.issues
        .map((issue) => {
          const index = Number(issue.path[2]);
          const item = content[index];
          const label =
            item?.type === "prompt_component"
              ? {
                  opening: "Opening text",
                  plot: "Plot",
                  author_note: "Author's note",
                  ai_instructions: "AI instructions",
                }[item.promptType]
              : item
                ? `${item.type.replaceAll("_", " ")} ${content.slice(0, index + 1).filter((entry) => entry.type === item.type).length}: ${issue.path.slice(3).join(" ")}`
                : "Scenario";
          return `${label}: ${issue.message}`;
        })
        .join("\n"),
    );
  }
}

export async function startCatalogScenario(
  transport: CatalogTransport,
  scenarioId: string,
  options: CatalogScenarioStartOptions = {},
): Promise<string> {
  const snapshot = options.scenarioSnapshot
    ? structuredClone(options.scenarioSnapshot)
    : await getCatalogScenario(transport, scenarioId);
  if (snapshot.id !== scenarioId)
    throw new Error("Scenario snapshot does not match");
  const expectedVersionId =
    options.expectedVersionId ?? snapshot.currentVersionId;
  if (!expectedVersionId || expectedVersionId !== snapshot.currentVersionId) {
    throw new Error("Scenario version is missing or does not match");
  }
  // Reject invalid/missing answers before counting a start or writing any tale.
  resolveScenarioPackage(
    parseScenarioPackage(snapshot.package),
    options.answers,
  );
  const response = bodyValue(
    await transport.post(
      `/v1/catalog/scenarios/${encodeURIComponent(scenarioId)}/start`,
      { expectedVersionId },
    ),
  ) as CatalogStartResponse;
  if (response.source?.catalogScenarioVersionId !== expectedVersionId) {
    throw new CatalogHttpError(
      "This scenario was updated. Please answer the new setup questions.",
      409,
      "scenario_version_changed",
    );
  }
  const pkg = resolveScenarioPackage(
    parseScenarioPackage(response.package),
    options.answers,
  );
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
  assertValidScenarioQuestions(input.package.scenario.content);
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
  assertValidScenarioQuestions(input.package.scenario.content);
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
  metadata: Pick<ScenarioPackageMetadata, "tags">;
  thumbnailAssetId?: string | null;
}): Promise<CatalogOwnedScenarioDetail> {
  const pkg = buildScenarioPackage(input.scenario, {
    tags: input.metadata.tags,
  });
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
    draftCoverInitialized: true,
  });
  return detail;
}

export async function prepareScenarioPublishDraft(
  scenario: Scenario,
  transport: CatalogTransport,
): Promise<{
  scenario: Scenario;
  published: CatalogOwnedScenarioDetail | null;
}> {
  const link = await getScenarioPublishLink(scenario.id);
  if (!link) return { scenario, published: null };
  const coverState = !link.draftCoverInitialized
    ? await getScenarioDraftCoverState(scenario.id)
    : null;
  const published = await getOwnedCatalogScenario(
    transport,
    link.catalogScenarioId,
  );
  if (!coverState) return { scenario, published };

  const thumbnail =
    coverState.thumbnail ??
    scenario.thumbnail ??
    (published.thumbnail
      ? await downloadPublishedDraftCover(published.thumbnail)
      : null);
  const initialized = await initializeScenarioDraftCover({
    localScenarioId: scenario.id,
    catalogScenarioId: link.catalogScenarioId,
    expectedUpdatedAt: coverState.updatedAt,
    thumbnail,
  });
  return { scenario: { ...scenario, thumbnail: initialized }, published };
}

async function downloadPublishedDraftCover(
  asset: CoverAssetReference,
): Promise<Uint8Array> {
  const maxBytes = 20 * 1024 * 1024;
  if (
    !Number.isSafeInteger(asset.byteSize) ||
    asset.byteSize < 1 ||
    asset.byteSize > maxBytes ||
    !/^[a-f\d]{64}$/i.test(asset.sha256) ||
    !["image/png", "image/jpeg", "image/webp"].includes(asset.contentType)
  ) {
    throw new Error("The published cover has invalid image metadata.");
  }
  const url = new URL(asset.downloadUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("The published cover has an invalid download URL.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(asset.downloadUrl, {
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(
        "Could not restore the published cover. Please try again.",
      );
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(asset.byteSize);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > bytes.length - offset) {
          throw new Error("The published cover exceeds its declared size.");
        }
        bytes.set(value, offset);
        offset += value.byteLength;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (
      offset !== asset.byteSize ||
      detectCoverImageContentType(bytes) !== asset.contentType ||
      (await sha256Hex(bytes)) !== asset.sha256.toLowerCase()
    ) {
      throw new Error("The published cover did not pass its integrity check.");
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadPublicCatalogThumbnail(
  transport: CatalogTransport,
  thumbnail: CatalogThumbnailUpload,
): Promise<CoverAssetReference> {
  const cover = await optimizeCoverImage(thumbnail);
  const intent = bodyValue(
    await transport.post("/v1/assets/cover-upload-intents", {
      visibility: "public",
      contentType: cover.contentType,
      byteSize: cover.bytes.byteLength,
      sha256: await sha256Hex(cover.bytes),
      width: cover.width,
      height: cover.height,
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
    body: new Blob([cover.bytes.slice().buffer], {
      type: cover.contentType,
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
  if (options.q?.trim()) query.set("q", options.q.trim());
  if (options.sort) query.set("sort", options.sort);
  for (const tag of normalizeCatalogTags(options.tag)) query.append("tag", tag);
  return query.toString();
}

function catalogTagQuery(options: CatalogTagListOptions): string {
  const query = new URLSearchParams();
  if (options.q?.trim()) query.set("q", options.q.trim());
  if (options.search?.trim()) query.set("search", options.search.trim());
  if (options.sort) query.set("sort", options.sort);
  if (options.limit) query.set("limit", String(options.limit));
  for (const tag of normalizeCatalogTags(options.tag)) query.append("tag", tag);
  return query.toString();
}
