import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  asApiObject,
  parseApiError,
  parseApiResponseBody,
} from "@/services/api-error";
import {
  exportTalePackage,
  getTaleSaveVersion,
  importTalePackage,
  replaceTaleWithPackage,
} from "@/repositories/tale.repository";
import {
  getTaleSyncState,
  setSyncProfileDisabled,
  setTaleSyncStatus,
  upsertSyncProfile,
  upsertTaleSyncState,
  upsertTaleSyncStateIfTaleVersion,
  type TaleSyncState,
} from "@/repositories/sync.repository";
import type { TalePackageV1 } from "@/types/export.type";
import {
  cloudFeatureAvailable,
  HAKAWATI_CLIENT_HEADERS,
  parseCloudCapabilities,
  type CloudCapabilities,
} from "@/services/cloud-capabilities";

export type SyncMode = "hosted" | "personal";

export type SyncProfile = {
  id: string;
  baseUrl: string;
  mode: SyncMode;
  accountId?: string | null;
  deviceId?: string | null;
  enabled?: boolean;
  disabledReason?: SyncDisabledReason | null;
};

export type SyncDisabledReason =
  | "device_limit"
  | "signed_out"
  | "user_disabled";

export type SyncWriteOptions = {
  idempotencyKey?: string;
};

export type SyncTransport = {
  get(path: string): Promise<unknown>;
  post(
    path: string,
    body: unknown,
    options?: SyncWriteOptions,
  ): Promise<unknown>;
  put(
    path: string,
    body: unknown,
    options?: SyncWriteOptions,
  ): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
};

export type SyncTransportOptions = {
  profile: SyncProfile;
  accessToken?: string;
  deviceId?: string;
};

export type SyncCapabilities = CloudCapabilities;

export type SyncTalePackageV1 = {
  format: "hakawati-tale-package";
  formatVersion: 1;
  exportedAt: string;
  tale: {
    id: string;
    title: string;
    description: string;
    gameMode: string;
    thumbnailAssetId?: string | null;
    coverAssetId?: string | null;
    createdAt: number;
    updatedAt: number;
    schemaVersion: number;
  };
  state: {
    stateSchemaVersion: number;
    data: unknown;
  };
  turns: Array<{
    id: string;
    seq: number;
    createdAt: number;
    entries: unknown[];
  }>;
  assets?: Array<{
    id: string;
    role: "thumbnail";
    contentType: string;
    dataBase64?: string;
  }>;
};

export type HostedAuthConfig = {
  provider: "logto";
  issuer: string;
  audience: string;
  clientId: string;
  scopes: string[];
};

type OAuthLoopbackStart = {
  id: string;
  redirectUri: string;
};

type OidcDiscovery = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

export type HostedSignInResult = {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
};

export class HostedSignInCancelledError extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "HostedSignInCancelledError";
  }
}

export function isHostedSignInCancelledError(
  error: unknown,
): error is HostedSignInCancelledError {
  return error instanceof HostedSignInCancelledError;
}

export type HostedAccount = {
  id: string;
  emailNormalized: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HostedAccountUsage = {
  tales: {
    used: number;
    limit: number;
  };
  storage: {
    usedBytes: number;
    limitBytes: number;
  };
};

export type SyncDevice = {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
};

export type RegisterSyncDeviceInput = {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
};

export type RemoteTale = {
  id: string;
  title: string;
  description: string | null;
  gameMode: string;
  coverAssetId: string | null;
  thumbnailAssetId: string | null;
  contentRev: number;
  metadataRev: number;
  turnCount: number;
  entryCount?: number;
  storageBytes?: number;
  updatedAt: string;
  lastEntryPreview: string | null;
};

export type RemoteTalePage = {
  items: RemoteTale[];
  nextCursor: string | null;
};

export type RemoteTalePackageResponse = {
  id: string;
  contentRev: number;
  metadataRev: number;
  turnCount: number;
  entryCount?: number;
  package: SyncTalePackageV1;
  cover?: unknown;
};

export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = String(status),
  ) {
    super(message);
  }
}

function isDeviceLimitError(error: unknown): boolean {
  return (
    error instanceof SyncHttpError &&
    error.status === 403 &&
    error.code === "device_limit_exceeded"
  );
}

function isUnregisteredDeviceError(error: unknown): boolean {
  return (
    error instanceof SyncHttpError &&
    error.status === 403 &&
    error.code === "device_not_registered"
  );
}

const bodyValue = asApiObject;

function rev(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function contentRevNumber(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Synced tale is missing a valid content revision");
  }
  return parsed;
}

function metadataRevNumber(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Synced tale is missing a valid metadata revision");
  }
  return parsed;
}

function syncBaseUrl(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function requireSecureHostedUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  const developmentLoopback =
    import.meta.env.DEV &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !developmentLoopback) {
    throw new Error(`${label} must use HTTPS`);
  }
  return url;
}

function validateOidcDiscovery(
  configuredIssuer: string,
  discovery: OidcDiscovery,
): void {
  const issuer = requireSecureHostedUrl(configuredIssuer, "OIDC issuer");
  if (
    discovery.issuer &&
    discovery.issuer.replace(/\/+$/, "") !==
      configuredIssuer.replace(/\/+$/, "")
  ) {
    throw new Error(
      "OIDC discovery issuer does not match the configured issuer",
    );
  }
  for (const [label, value] of [
    ["OIDC authorization endpoint", discovery.authorization_endpoint],
    ["OIDC token endpoint", discovery.token_endpoint],
  ] as const) {
    if (!value) continue;
    const endpoint = requireSecureHostedUrl(value, label);
    if (endpoint.origin !== issuer.origin) {
      throw new Error(`${label} must share the configured issuer origin`);
    }
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

export function createSyncTransport({
  profile,
  accessToken,
  deviceId,
}: SyncTransportOptions): SyncTransport {
  const base = syncBaseUrl(profile.baseUrl);
  if (profile.mode === "hosted") {
    requireSecureHostedUrl(base, "Hosted cloud URL");
  }
  const syncDeviceId = deviceId ?? profile.deviceId ?? undefined;

  async function request(
    method: string,
    path: string,
    body?: unknown,
    options: SyncWriteOptions = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      ...HAKAWATI_CLIENT_HEADERS,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(profile.mode === "hosted" && accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...(profile.mode === "hosted" && method !== "GET" && syncDeviceId
        ? { "X-Hakawati-Device-Id": syncDeviceId }
        : {}),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    };
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = parseApiResponseBody(text);
    if (!response.ok) {
      const error = parseApiError(data, response.status, text);
      throw new SyncHttpError(error.message, response.status, error.code);
    }
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body, options) => request("POST", path, body, options),
    put: (path, body, options) => request("PUT", path, body, options),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path) => request("DELETE", path),
  };
}

export async function fetchSyncCapabilities(
  transport: SyncTransport,
): Promise<SyncCapabilities> {
  const capabilities = parseCloudCapabilities(
    bodyValue(await transport.get("/v1/capabilities")),
  );
  if (!capabilities) {
    throw new SyncHttpError(
      "The cloud server returned an invalid compatibility contract.",
      503,
      "capabilities_invalid",
    );
  }
  return capabilities;
}

export async function fetchHostedAuthConfig(
  transport: SyncTransport,
): Promise<HostedAuthConfig> {
  return bodyValue(await transport.get("/v1/auth/config")) as HostedAuthConfig;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomString(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(digest));
}

async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscovery> {
  const issuerBase = issuer.replace(/\/$/, "");
  const response = await fetch(
    `${issuerBase}/.well-known/openid-configuration`,
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as OidcDiscovery;
}

async function cancelOAuthLoopback(id: string): Promise<void> {
  await Promise.resolve(invoke("cancel_oauth_loopback", { id })).catch(
    () => undefined,
  );
}

export async function signInHostedSync(input: {
  profile: SyncProfile;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<HostedSignInResult> {
  const transport = createSyncTransport({ profile: input.profile });
  assertSyncAvailable(await fetchSyncCapabilities(transport));
  const authConfig = await fetchHostedAuthConfig(transport);
  const discovery = await fetchOidcDiscovery(authConfig.issuer);
  validateOidcDiscovery(authConfig.issuer, discovery);
  if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error("OIDC discovery did not return sign-in endpoints");
  }

  const loopback = await invoke<OAuthLoopbackStart>("start_oauth_loopback");
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);
  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("client_id", authConfig.clientId);
  authUrl.searchParams.set("redirect_uri", loopback.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    Array.from(new Set([...authConfig.scopes, "offline_access"])).join(" "),
  );
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (authConfig.audience) {
    authUrl.searchParams.set("resource", authConfig.audience);
  }

  let removeAbortListener: () => void = () => {};
  let callbackValue: string;
  const cancelled = new Promise<never>((_, reject) => {
    if (!input.signal) return;
    const onAbort = () => {
      void cancelOAuthLoopback(loopback.id).finally(() =>
        reject(new HostedSignInCancelledError()),
      );
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () =>
      input.signal?.removeEventListener("abort", onAbort);
    if (input.signal.aborted) onAbort();
  });
  try {
    await Promise.race([openUrl(authUrl), cancelled]);
    const waitForCallback = invoke<string>("wait_oauth_loopback", {
      id: loopback.id,
      timeoutMs: input.timeoutMs ?? 120_000,
    });
    callbackValue = await Promise.race([waitForCallback, cancelled]);
  } catch (error) {
    if (input.signal?.aborted) throw new HostedSignInCancelledError();
    throw error;
  } finally {
    removeAbortListener();
    await cancelOAuthLoopback(loopback.id);
  }

  const callback = new URL(callbackValue);
  if (callback.searchParams.get("state") !== state) {
    throw new Error("Sign-in state did not match");
  }
  const error = callback.searchParams.get("error");
  if (error) {
    throw new Error(callback.searchParams.get("error_description") ?? error);
  }
  const code = callback.searchParams.get("code");
  if (!code) {
    throw new Error("Sign-in callback did not include an authorization code");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: authConfig.clientId,
    redirect_uri: loopback.redirectUri,
    code,
    code_verifier: verifier,
  });
  if (authConfig.audience) {
    body.set("resource", authConfig.audience);
  }
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenBody = (await tokenResponse
    .json()
    .catch(() => null)) as TokenResponse | null;
  if (!tokenResponse.ok || !tokenBody?.access_token) {
    throw new Error(
      tokenBody?.error_description ??
        tokenBody?.message ??
        tokenBody?.error ??
        "Sign-in token exchange failed",
    );
  }

  return {
    accessToken: tokenBody.access_token,
    ...(tokenBody.expires_in ? { expiresIn: tokenBody.expires_in } : {}),
    ...(tokenBody.refresh_token
      ? { refreshToken: tokenBody.refresh_token }
      : {}),
  };
}

export async function refreshHostedSync(input: {
  profile: SyncProfile;
  refreshToken: string;
}): Promise<HostedSignInResult> {
  const transport = createSyncTransport({ profile: input.profile });
  await fetchSyncCapabilities(transport);
  const authConfig = await fetchHostedAuthConfig(transport);
  const discovery = await fetchOidcDiscovery(authConfig.issuer);
  validateOidcDiscovery(authConfig.issuer, discovery);
  if (!discovery.token_endpoint) {
    throw new Error("OIDC discovery did not return a token endpoint");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: authConfig.clientId,
    refresh_token: input.refreshToken,
  });
  if (authConfig.audience) {
    body.set("resource", authConfig.audience);
  }
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenBody = (await tokenResponse
    .json()
    .catch(() => null)) as TokenResponse | null;
  if (!tokenResponse.ok || !tokenBody?.access_token) {
    throw new Error(
      tokenBody?.error_description ??
        tokenBody?.message ??
        tokenBody?.error ??
        "Hosted session refresh failed",
    );
  }

  return {
    accessToken: tokenBody.access_token,
    ...(tokenBody.expires_in ? { expiresIn: tokenBody.expires_in } : {}),
    ...(tokenBody.refresh_token
      ? { refreshToken: tokenBody.refresh_token }
      : {}),
  };
}

export async function getHostedAccount(
  transport: SyncTransport,
): Promise<HostedAccount> {
  return bodyValue(await transport.get("/v1/accounts/me")) as HostedAccount;
}

export async function fetchHostedAccountUsage(
  transport: SyncTransport,
): Promise<HostedAccountUsage> {
  return bodyValue(
    await transport.get("/v1/accounts/me/usage"),
  ) as HostedAccountUsage;
}

export async function updateHostedAccountProfile(
  transport: SyncTransport,
  input: { displayName: string },
): Promise<HostedAccount> {
  return bodyValue(
    await transport.patch("/v1/accounts/me", input),
  ) as HostedAccount;
}

export async function registerSyncDevice(
  transport: SyncTransport,
  device: RegisterSyncDeviceInput,
): Promise<SyncDevice> {
  return bodyValue(
    await transport.put("/v1/devices/current", {
      clientDeviceId: device.id,
      name: device.name,
      platform: device.platform,
      appVersion: device.appVersion,
    }),
  ) as SyncDevice;
}

export async function listHostedDevices(
  transport: SyncTransport,
): Promise<SyncDevice[]> {
  return (await transport.get("/v1/devices")) as SyncDevice[];
}

export async function unregisterHostedDevice(
  transport: SyncTransport,
  deviceId: string,
): Promise<void> {
  await transport.delete(`/v1/devices/${encodeURIComponent(deviceId)}`);
}

export async function listRemoteTales(
  transport: SyncTransport,
  options: { cursor?: string; limit?: number } = {},
): Promise<RemoteTalePage> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  const encoded = query.toString();
  const suffix = encoded ? `?${encoded}` : "";
  return bodyValue(await transport.get(`/v1/tales${suffix}`)) as RemoteTalePage;
}

export async function listAllRemoteTales(
  transport: SyncTransport,
  limit = 100,
): Promise<RemoteTale[]> {
  const items: RemoteTale[] = [];
  let cursor: string | undefined;
  do {
    const page = await listRemoteTales(transport, { cursor, limit });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export async function downloadRemoteTalePackage(
  transport: SyncTransport,
  remoteTaleId: string,
): Promise<RemoteTalePackageResponse> {
  return bodyValue(
    await transport.get(
      `/v1/tales/${encodeURIComponent(remoteTaleId)}/package`,
    ),
  ) as RemoteTalePackageResponse;
}

export async function deleteRemoteTale(
  transport: SyncTransport,
  remoteTaleId: string,
  baseMetadataRev: number,
): Promise<void> {
  await transport.delete(
    `/v1/tales/${encodeURIComponent(remoteTaleId)}?baseMetadataRev=${baseMetadataRev}`,
  );
}

export function toSyncTalePackage(
  pkg: TalePackageV1,
  options: { mode: SyncMode; coverAssetId?: string } = { mode: "personal" },
): SyncTalePackageV1 {
  const remoteCover =
    options.mode === "hosted" && options.coverAssetId
      ? {
          coverAssetId: options.coverAssetId,
          thumbnailAssetId: options.coverAssetId,
        }
      : {};
  return {
    format: pkg.format,
    formatVersion: pkg.formatVersion,
    exportedAt: pkg.exportedAt,
    tale: {
      id: pkg.tale.id,
      title: pkg.tale.title,
      description: pkg.tale.description,
      gameMode: pkg.tale.gameMode,
      createdAt: pkg.tale.createdAt,
      updatedAt: pkg.tale.updatedAt,
      schemaVersion: pkg.tale.schemaVersion,
      ...remoteCover,
    },
    state: {
      stateSchemaVersion: pkg.state.stateSchemaVersion,
      data: {
        components: pkg.state.data.components,
        storyCards: pkg.state.data.storyCards,
        ...(pkg.tale.source ? { source: pkg.tale.source } : {}),
        gm: {
          stats: pkg.state.data.gm.stats,
          inventory: pkg.state.data.gm.inventory,
          scratchpad: pkg.state.data.gm.scratchpad,
        },
      },
    },
    turns: pkg.turns.map(({ updatedAt: _updatedAt, ...turn }) => turn),
    assets: [],
  };
}

export function canUploadCoverAssets(capabilities: SyncCapabilities): boolean {
  return cloudFeatureAvailable(capabilities, "coverStorage");
}

export function assertSyncAvailable(capabilities: SyncCapabilities) {
  if (!cloudFeatureAvailable(capabilities, "sync")) {
    throw new SyncHttpError(
      "Cloud sync is unavailable for this Hakawati version.",
      503,
      "sync_unavailable",
    );
  }
}

function localThumbnailAsset(pkg: TalePackageV1) {
  return pkg.assets.find((asset) => asset.id === pkg.tale.thumbnailAssetId);
}

async function uploadHostedCoverAsset(
  transport: SyncTransport,
  asset: TalePackageV1["assets"][number],
): Promise<string> {
  const bytes = base64ToBytes(asset.dataBase64);
  const intent = bodyValue(
    await transport.post("/v1/assets/cover-upload-intents", {
      visibility: "private",
      contentType: asset.contentType,
      byteSize: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    }),
  );
  const upload = bodyValue(intent.upload);
  const cover = bodyValue(intent.asset);
  const assetId = typeof cover.assetId === "string" ? cover.assetId : null;
  const uploadUrl = typeof upload.url === "string" ? upload.url : null;
  const uploadMethod =
    typeof upload.method === "string" ? upload.method : "PUT";
  const uploadHeaders = bodyValue(upload.headers) as Record<string, string>;
  if (!assetId || !uploadUrl) {
    throw new Error("Cover upload intent did not include upload details");
  }

  const response = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: uploadHeaders,
    body: new Blob([bytes.slice().buffer], { type: asset.contentType }),
  });
  if (!response.ok) {
    throw new SyncHttpError(
      "Cover upload failed",
      response.status,
      "cover_upload_failed",
    );
  }

  await transport.post(
    `/v1/assets/${encodeURIComponent(assetId)}/complete`,
    {},
  );
  return assetId;
}

async function toUploadSyncPackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localPackage: TalePackageV1;
  capabilities?: SyncCapabilities;
}): Promise<SyncTalePackageV1> {
  const capabilities =
    input.capabilities ?? (await fetchSyncCapabilities(input.transport));
  assertSyncAvailable(capabilities);
  const coverAsset =
    input.profile.mode === "hosted" && canUploadCoverAssets(capabilities)
      ? localThumbnailAsset(input.localPackage)
      : undefined;
  const coverAssetId = coverAsset
    ? await uploadHostedCoverAsset(input.transport, coverAsset)
    : undefined;
  return toSyncTalePackage(input.localPackage, {
    mode: input.profile.mode,
    ...(coverAssetId ? { coverAssetId } : {}),
  });
}

export function remoteTaleChanged(
  state: {
    remoteTaleId: string;
    contentRev: string | null;
    metadataRev: string | null;
  },
  remote: RemoteTale,
): boolean {
  return (
    state.remoteTaleId === remote.id &&
    (Number(state.contentRev) !== remote.contentRev ||
      Number(state.metadataRev) !== remote.metadataRev)
  );
}

export type LinkedTaleSyncResult = "skipped" | "pushed" | "pulled" | "conflict";

function localMetadataChanged(pkg: TalePackageV1, remote: RemoteTale) {
  return (
    pkg.tale.title !== remote.title ||
    pkg.tale.description !== (remote.description ?? "") ||
    pkg.tale.gameMode !== remote.gameMode
  );
}

function hasLocalPendingWork(state: TaleSyncState) {
  return state.pendingStatus === "push" || state.pendingStatus === "error";
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function comparableTalePackage(pkg: TalePackageV1) {
  return {
    tale: {
      id: pkg.tale.id,
      title: pkg.tale.title,
      description: pkg.tale.description,
      gameMode: pkg.tale.gameMode,
      source: pkg.tale.source,
    },
    state: pkg.state,
    turns: pkg.turns,
  };
}

async function reconcileAmbiguousSuccessfulSync(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  state: TaleSyncState;
  localTaleId: string;
}): Promise<boolean> {
  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const [localPackage, remote] = await Promise.all([
    exportTalePackage(input.localTaleId),
    downloadRemoteTalePackage(input.transport, input.state.remoteTaleId),
  ]);
  const remotePackage = toLocalTalePackage(remote.package);
  if (
    stableJson(comparableTalePackage(localPackage)) !==
    stableJson(comparableTalePackage(remotePackage))
  ) {
    return false;
  }
  return setTaleSynced({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
    result: remote,
    remoteTaleId: remote.id,
    contentRev: input.state.contentRev,
    metadataRev: input.state.metadataRev,
    expectedSaveVersion,
  });
}

function syncFailureStatus(error: unknown): "conflict" | "error" {
  return error instanceof SyncHttpError && error.status === 409
    ? "conflict"
    : "error";
}

async function setTaleSyncFailure(
  input: { profileId: string; accountId?: string | null; localTaleId: string },
  error: unknown,
) {
  await setTaleSyncStatus({
    ...input,
    pendingStatus: syncFailureStatus(error),
    lastErrorCode: error instanceof SyncHttpError ? error.code : "sync_failed",
  });
}

async function setTaleSynced(input: {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
  result: Record<string, unknown>;
  remoteTaleId: string;
  contentRev: string | null;
  metadataRev: string | null;
  expectedSaveVersion: number;
}) {
  return upsertTaleSyncStateIfTaleVersion(
    {
      profileId: input.profileId,
      accountId: input.accountId,
      localTaleId: input.localTaleId,
      remoteTaleId:
        typeof input.result.id === "string"
          ? input.result.id
          : input.remoteTaleId,
      contentRev: rev(input.result.contentRev) ?? input.contentRev,
      metadataRev: rev(input.result.metadataRev) ?? input.metadataRev,
      lastSyncedAt: Date.now(),
      pendingStatus: "idle",
      lastErrorCode: null,
    },
    input.expectedSaveVersion,
  );
}

export async function syncLinkedTale(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  remoteTale: RemoteTale;
  idempotencyKey: string;
  capabilities?: SyncCapabilities;
}): Promise<LinkedTaleSyncResult> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state || state.remoteTaleId !== input.remoteTale.id) {
    return "skipped";
  }
  if (state.pendingStatus === "conflict") {
    return "skipped";
  }

  const remoteChanged = remoteTaleChanged(state, input.remoteTale);
  if (
    remoteChanged &&
    state.pendingStatus === "error" &&
    state.lastErrorCode === "sync_failed" &&
    (await reconcileAmbiguousSuccessfulSync({
      profile: input.profile,
      transport: input.transport,
      state,
      localTaleId: input.localTaleId,
    }))
  ) {
    return "pushed";
  }
  if (remoteChanged && hasLocalPendingWork(state)) {
    await setTaleSyncStatus({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      pendingStatus: "conflict",
      lastErrorCode: "remote_changed",
    });
    return "conflict";
  }

  if (remoteChanged) {
    try {
      const applied = await applyRemoteTalePackage({
        profile: input.profile,
        transport: input.transport,
        localTaleId: input.localTaleId,
      });
      if (!applied) return "conflict";
    } catch (error) {
      await setTaleSyncStatus({
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
        pendingStatus: syncFailureStatus(error),
        lastErrorCode:
          error instanceof SyncHttpError ? error.code : "sync_failed",
      });
      throw error;
    }
    return "pulled";
  }

  if (!hasLocalPendingWork(state)) {
    return "skipped";
  }

  const pkg = await exportTalePackage(input.localTaleId);
  const metadataChanged = localMetadataChanged(pkg, input.remoteTale);
  if (metadataChanged) {
    await pushTaleMetadataPatch({
      profile: input.profile,
      transport: input.transport,
      localTaleId: input.localTaleId,
    });
  }

  if (pkg.turns.length <= input.remoteTale.turnCount) {
    await replaceRemoteTalePackage({
      profile: input.profile,
      transport: input.transport,
      localTaleId: input.localTaleId,
      idempotencyKey: input.idempotencyKey,
      capabilities: input.capabilities,
    });
    return "pushed";
  }

  // ponytail: one dirty bit means metadata-only saves may send stateAfter too; split dirty flags if content-rev churn matters.
  await pushTaleContentBatch({
    profile: input.profile,
    transport: input.transport,
    localTaleId: input.localTaleId,
    remoteTale: input.remoteTale,
    idempotencyKey: input.idempotencyKey,
  });

  return "pushed";
}

function toLocalTalePackage(
  pkg: RemoteTalePackageResponse["package"],
): TalePackageV1 {
  const assets = (pkg.assets ?? []).filter(
    (asset): asset is TalePackageV1["assets"][number] =>
      typeof asset.dataBase64 === "string",
  );
  const assetIds = new Set(assets.map((asset) => asset.id));
  const { thumbnailAssetId, coverAssetId, ...tale } = pkg.tale;
  const localThumbnailAssetId = thumbnailAssetId ?? coverAssetId ?? undefined;

  return {
    ...pkg,
    tale: {
      ...tale,
      gameMode: tale.gameMode as TalePackageV1["tale"]["gameMode"],
      ...(localThumbnailAssetId && assetIds.has(localThumbnailAssetId)
        ? { thumbnailAssetId: localThumbnailAssetId }
        : {}),
    },
    state: pkg.state as TalePackageV1["state"],
    turns: pkg.turns as TalePackageV1["turns"],
    assets,
  };
}

export async function prepareHostedSync(input: {
  profile: SyncProfile;
  accessToken: string;
  device: Omit<RegisterSyncDeviceInput, "id">;
  getDeviceIdForAccount: (accountId: string) => string;
}): Promise<{
  capabilities: SyncCapabilities;
  authConfig: HostedAuthConfig;
  account: HostedAccount;
  device: SyncDevice | null;
  transport: SyncTransport;
}> {
  const publicTransport = createSyncTransport({ profile: input.profile });
  const capabilities = await fetchSyncCapabilities(publicTransport);
  assertSyncAvailable(capabilities);
  const authConfig = await fetchHostedAuthConfig(publicTransport);
  const accountTransport = createSyncTransport({
    profile: input.profile,
    accessToken: input.accessToken,
  });
  const account = await getHostedAccount(accountTransport);
  const deviceId = input.getDeviceIdForAccount(account.id);
  const profile = { ...input.profile, accountId: account.id, deviceId };
  await upsertSyncProfile(profile);
  const transport = createSyncTransport({
    profile,
    accessToken: input.accessToken,
  });
  let device: SyncDevice;
  try {
    device = await registerSyncDevice(transport, {
      ...input.device,
      id: deviceId,
    });
  } catch (error) {
    if (isDeviceLimitError(error)) {
      await setSyncProfileDisabled(profile.id, "device_limit");
      return { capabilities, authConfig, account, device: null, transport };
    }
    throw error;
  }
  await upsertSyncProfile({
    ...profile,
    enabled: true,
    disabledReason: null,
  });
  return { capabilities, authConfig, account, device, transport };
}

export async function uploadTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  idempotencyKey: string;
  capabilities?: SyncCapabilities;
}): Promise<void> {
  await upsertSyncProfile(input.profile);

  try {
    const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
    const pkg = await exportTalePackage(input.localTaleId);
    const syncPackage = await toUploadSyncPackage({
      profile: input.profile,
      transport: input.transport,
      localPackage: pkg,
      capabilities: input.capabilities,
    });
    const result = bodyValue(
      await input.transport.post(
        "/v1/tales",
        { package: syncPackage },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    await setTaleSynced({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      result,
      remoteTaleId: input.localTaleId,
      contentRev: null,
      metadataRev: null,
      expectedSaveVersion,
    });
  } catch (error) {
    if (
      input.profile.mode === "hosted" &&
      (isDeviceLimitError(error) || isUnregisteredDeviceError(error))
    ) {
      await setSyncProfileDisabled(input.profile.id, "device_limit");
    }
    await setTaleSyncFailure(
      {
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
      },
      error,
    );
    throw error;
  }
}

export async function replaceRemoteTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  idempotencyKey: string;
  capabilities?: SyncCapabilities;
  forceReplace?: boolean;
}): Promise<unknown> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }

  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const pkg = await exportTalePackage(input.localTaleId);
  try {
    const syncPackage = await toUploadSyncPackage({
      profile: input.profile,
      transport: input.transport,
      localPackage: pkg,
      capabilities: input.capabilities,
    });
    const body: {
      package: SyncTalePackageV1;
      confirmReplace: true;
      baseContentRev?: number;
    } = {
      package: syncPackage,
      confirmReplace: true,
    };
    if (!input.forceReplace) {
      body.baseContentRev = contentRevNumber(state.contentRev);
    }
    const result = bodyValue(
      await input.transport.put(
        `/v1/tales/${encodeURIComponent(state.remoteTaleId)}/package`,
        body,
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    await setTaleSynced({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      result,
      remoteTaleId: state.remoteTaleId,
      contentRev: state.contentRev,
      metadataRev: state.metadataRev,
      expectedSaveVersion,
    });
    return result;
  } catch (error) {
    await setTaleSyncFailure(
      {
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
      },
      error,
    );
    throw error;
  }
}

export async function pushTaleContentBatch(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  remoteTale: Pick<RemoteTale, "turnCount">;
  idempotencyKey: string;
}): Promise<unknown> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }

  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const pkg = await exportTalePackage(input.localTaleId);
  const syncPackage = toSyncTalePackage(pkg, { mode: input.profile.mode });
  const baseContentRev = contentRevNumber(state.contentRev);
  try {
    const result = bodyValue(
      await input.transport.post(
        `/v1/tales/${encodeURIComponent(state.remoteTaleId)}/content-batch`,
        {
          baseContentRev,
          turns: syncPackage.turns.filter(
            (turn) => turn.seq > input.remoteTale.turnCount,
          ),
          stateAfter: syncPackage.state,
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    await setTaleSynced({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      result,
      remoteTaleId: state.remoteTaleId,
      contentRev: state.contentRev,
      metadataRev: state.metadataRev,
      expectedSaveVersion,
    });
    return result;
  } catch (error) {
    await setTaleSyncFailure(
      {
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
      },
      error,
    );
    throw error;
  }
}

export async function pushTaleMetadataPatch(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
}): Promise<unknown> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }

  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const pkg = await exportTalePackage(input.localTaleId);
  try {
    const result = bodyValue(
      await input.transport.patch(
        `/v1/tales/${encodeURIComponent(state.remoteTaleId)}/metadata`,
        {
          baseMetadataRev: metadataRevNumber(state.metadataRev),
          patch: {
            title: pkg.tale.title,
            description: pkg.tale.description,
            gameMode: pkg.tale.gameMode,
          },
        },
      ),
    );
    await setTaleSynced({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      result,
      remoteTaleId: state.remoteTaleId,
      contentRev: state.contentRev,
      metadataRev: state.metadataRev,
      expectedSaveVersion,
    });
    return result;
  } catch (error) {
    await setTaleSyncFailure(
      {
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
      },
      error,
    );
    throw error;
  }
}

export async function keepBothTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  idempotencyKey: string;
  capabilities?: SyncCapabilities;
}): Promise<string> {
  const pkg = await exportTalePackage(input.localTaleId);
  const copyId = await importTalePackage(pkg, {
    title: `${pkg.tale.title} (copy)`,
  });
  await uploadTalePackage({
    profile: input.profile,
    transport: input.transport,
    localTaleId: copyId,
    idempotencyKey: input.idempotencyKey,
    capabilities: input.capabilities,
  });
  await applyRemoteTalePackage({
    profile: input.profile,
    transport: input.transport,
    localTaleId: input.localTaleId,
  });
  return copyId;
}

export async function importRemoteTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  remoteTaleId: string;
  title?: string;
}): Promise<string> {
  await upsertSyncProfile(input.profile);
  const remote = await downloadRemoteTalePackage(
    input.transport,
    input.remoteTaleId,
  );
  const localTaleId = await importTalePackage(
    toLocalTalePackage(remote.package),
    {
      preserveId: true,
      ...(input.title ? { title: input.title } : {}),
    },
  );

  await upsertTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId,
    remoteTaleId: remote.id,
    contentRev: rev(remote.contentRev),
    metadataRev: rev(remote.metadataRev),
    lastSyncedAt: Date.now(),
    pendingStatus: "idle",
    lastErrorCode: null,
  });

  return localTaleId;
}

export async function applyRemoteTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
}): Promise<boolean> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }

  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const remote = await downloadRemoteTalePackage(
    input.transport,
    state.remoteTaleId,
  );
  const replaced = await replaceTaleWithPackage(
    input.localTaleId,
    toLocalTalePackage(remote.package),
    { expectedSaveVersion },
  );
  if (replaced === false) {
    await setTaleSyncStatus({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      pendingStatus: "conflict",
      lastErrorCode: "local_changed",
    });
    return false;
  }
  await upsertTaleSyncStateIfTaleVersion(
    {
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      remoteTaleId: remote.id,
      contentRev: rev(remote.contentRev),
      metadataRev: rev(remote.metadataRev),
      lastSyncedAt: Date.now(),
      pendingStatus: "idle",
      lastErrorCode: null,
    },
    expectedSaveVersion + 1,
  );
  return true;
}
