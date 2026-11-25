import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
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
  acknowledgeTaleSyncWrite,
  adoptTaleSyncRevisions,
  advanceMigratedTaleRevisions,
  deletePendingSyncWrite,
  getPendingSyncWrite,
  getTaleSyncState,
  savePendingSyncWrite,
  setSyncProfileDisabled,
  setTaleSyncStatus,
  upsertSyncProfile,
  upsertTaleSyncState,
  upsertTaleSyncStateIfTaleVersion,
} from "@/repositories/sync.repository";
import type { TalePackageV1 } from "@/types/export.type";
import type { CoverAssetReference } from "@/types/catalog.type";
import type {
  RemoteTale,
  RemoteTaleCover,
  RemoteTaleRevisions,
  SyncMode,
  SyncProfile,
  TaleSyncState,
} from "@/types/sync.type";
import {
  CLOUD_ENCRYPTION_SCHEME,
  cloudKeys,
  type CloudEncryptionContext,
  type CloudEnvelope,
  type TaleRevision,
} from "@/services/cloud-keys";
import {
  detectCoverImageContentType,
  optimizeCoverImage,
  sha256Hex,
} from "@/lib/cover-image";
import { createLinkedWriteIdempotencyKey } from "@/lib/sync-idempotency";
import { isRefusedSyncError } from "@/lib/sync-ui";
import {
  cloudFeatureAvailable,
  HAKAWATI_CLIENT_HEADERS,
  isCloudClientCompatible,
  parseCloudCapabilities,
  type CloudCapabilities,
} from "@/services/cloud-capabilities";

export type SyncWriteOptions = {
  idempotencyKey?: string;
  rawBody?: string;
};

export type CloudEncryptionSession = CloudEncryptionContext & {
  acceptServerTales: boolean;
};

export type SyncTransport = {
  readonly signal?: AbortSignal;
  readonly cloudEncryption?: CloudEncryptionSession;
  get(path: string): Promise<unknown>;
  getBytes?(path: string): Promise<Uint8Array>;
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
  signal?: AbortSignal;
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

export type RemoteTalePage = {
  items: RemoteTale[];
  nextCursor: string | null;
};

export type RemoteTalePackageResponse = {
  id: string;
  sourceTaleId: string;
  contentRev: number;
  metadataRev: number;
  turnCount: number;
  entryCount?: number;
  encryption?: "server" | "client";
  package: SyncTalePackageV1;
  cover?: unknown;
};

export type EncryptedTalePackage = {
  scheme: typeof CLOUD_ENCRYPTION_SCHEME;
  keyId: string;
  taleId: string;
  sourceTaleId: string;
  gameMode: string;
  stateSchemaVersion: number;
  turnCount: number;
  entryCount: number;
  coverAssetId: string | null;
  createdAt: number;
  updatedAt: number;
  summary: CloudEnvelope;
  package: CloudEnvelope;
};

type TaleSummary = {
  title: string;
  description: string;
  lastEntryPreview: string | null;
  cover: RemoteTaleCover | null;
  migratedFrom?: RemoteTaleRevisions;
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

export function isUpdateRequiredError(error: unknown): boolean {
  return error instanceof SyncHttpError && error.status === 426;
}

export function cloudLockedError() {
  return new SyncHttpError("Unlock this device to sync.", 423, "cloud_locked");
}

function cloudIntegrityError(message: string, code = "cloud_tale_invalid") {
  return new SyncHttpError(message, 502, code);
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

function revisionNumber(
  value: string | null,
  kind: "content" | "metadata",
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Synced tale is missing a valid ${kind} revision`);
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

const PRIVATE_DATA_PATH = /^\/v1\/(tales|assets)(\/|\?|$)/;
const DEVICE_READ_PATH = /^\/v1\/(accounts\/me\/cloud-key|cloud-key\/)/;

export function withCloudEncryption(
  transport: SyncTransport,
  session: CloudEncryptionSession,
): SyncTransport {
  return { ...transport, cloudEncryption: session };
}

export function createSyncTransport({
  profile,
  accessToken,
  deviceId,
  signal,
}: SyncTransportOptions): SyncTransport {
  const base = syncBaseUrl(profile.baseUrl);
  if (profile.mode === "hosted") {
    requireSecureHostedUrl(base, "Hosted cloud URL");
  }
  const syncDeviceId = deviceId ?? profile.deviceId ?? undefined;

  function send(
    method: string,
    path: string,
    body?: unknown,
    options: SyncWriteOptions = {},
  ): Promise<Response> {
    signal?.throwIfAborted();
    const payload =
      options.rawBody ??
      (body === undefined ? undefined : JSON.stringify(body));
    const headers: Record<string, string> = {
      ...HAKAWATI_CLIENT_HEADERS,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      ...(PRIVATE_DATA_PATH.test(path)
        ? { "X-Hakawati-Cloud-Encryption": CLOUD_ENCRYPTION_SCHEME }
        : {}),
      ...(profile.mode === "hosted" && accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...(profile.mode === "hosted" &&
      (method !== "GET" || DEVICE_READ_PATH.test(path)) &&
      syncDeviceId
        ? { "X-Hakawati-Device-Id": syncDeviceId }
        : {}),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    };
    return fetch(`${base}${path}`, {
      method,
      headers,
      ...(signal ? { signal } : {}),
      ...(payload === undefined ? {} : { body: payload }),
    });
  }

  async function failure(response: Response) {
    const text = await response.text();
    signal?.throwIfAborted();
    const error = parseApiError(
      parseApiResponseBody(text),
      response.status,
      text,
    );
    return new SyncHttpError(error.message, response.status, error.code);
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    options: SyncWriteOptions = {},
  ): Promise<unknown> {
    const response = await send(method, path, body, options);
    if (!response.ok) throw await failure(response);
    const text = await response.text();
    signal?.throwIfAborted();
    return parseApiResponseBody(text);
  }

  async function requestBytes(path: string): Promise<Uint8Array> {
    const response = await send("GET", path);
    if (!response.ok) throw await failure(response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal?.throwIfAborted();
    return bytes;
  }

  return {
    ...(signal ? { signal } : {}),
    get: (path) => request("GET", path),
    getBytes: requestBytes,
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

// A first sign-in can include creating an account and confirming an email.
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;

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
  const checkCancellation = () => {
    if (input.signal?.aborted) throw new HostedSignInCancelledError();
  };
  checkCancellation();
  const transport = createSyncTransport({ profile: input.profile });
  assertSyncAvailable(await fetchSyncCapabilities(transport));
  checkCancellation();
  const authConfig = await fetchHostedAuthConfig(transport);
  checkCancellation();
  const discovery = await fetchOidcDiscovery(authConfig.issuer);
  checkCancellation();
  validateOidcDiscovery(authConfig.issuer, discovery);
  if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error("OIDC discovery did not return sign-in endpoints");
  }

  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  checkCancellation();
  const loopback = await invoke<OAuthLoopbackStart>("start_oauth_loopback");
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
    await Promise.race([
      invoke("open_oauth_loopback_page", {
        id: loopback.id,
        url: authUrl.toString(),
      }),
      cancelled,
    ]);
    const waitForCallback = invoke<string>("wait_oauth_loopback", {
      id: loopback.id,
      timeoutMs: input.timeoutMs ?? SIGN_IN_TIMEOUT_MS,
    });
    callbackValue = await Promise.race([waitForCallback, cancelled]);
  } catch (error) {
    // The listener reports a closed sign-in sheet with the same message.
    if (
      input.signal?.aborted ||
      error === new HostedSignInCancelledError().message
    ) {
      throw new HostedSignInCancelledError();
    }
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
  checkCancellation();
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
    throw new SyncHttpError(
      tokenBody?.error_description ??
        tokenBody?.message ??
        tokenBody?.error ??
        "Hosted session refresh failed",
      tokenResponse.status,
      tokenBody?.error ?? "refresh_failed",
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

export async function deleteHostedAccount(
  transport: SyncTransport,
): Promise<void> {
  await transport.delete("/v1/accounts/me");
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
  const page = bodyValue(
    await transport.get(`/v1/tales${suffix}`),
  ) as RemoteTalePage;
  return { ...page, items: await openRemoteTales(transport, page.items) };
}

type ListedRemoteTale = RemoteTale & { summary?: CloudEnvelope | null };

function parseTaleSummary(value: string | null): TaleSummary | null {
  if (value === null) return null;
  try {
    const summary = bodyValue(JSON.parse(value));
    const cover = summary.cover ? bodyValue(summary.cover) : null;
    const migratedFrom = summary.migratedFrom
      ? bodyValue(summary.migratedFrom)
      : null;
    return {
      title: typeof summary.title === "string" ? summary.title : "",
      description:
        typeof summary.description === "string" ? summary.description : "",
      lastEntryPreview:
        typeof summary.lastEntryPreview === "string"
          ? summary.lastEntryPreview
          : null,
      cover:
        cover &&
        typeof cover.assetId === "string" &&
        typeof cover.contentType === "string" &&
        typeof cover.byteSize === "number" &&
        typeof cover.sha256 === "string"
          ? {
              assetId: cover.assetId,
              contentType: cover.contentType,
              byteSize: cover.byteSize,
              sha256: cover.sha256,
            }
          : null,
      ...(migratedFrom &&
      Number.isSafeInteger(migratedFrom.contentRev) &&
      Number.isSafeInteger(migratedFrom.metadataRev)
        ? {
            migratedFrom: {
              contentRev: migratedFrom.contentRev as number,
              metadataRev: migratedFrom.metadataRev as number,
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

async function openRemoteTales(
  transport: SyncTransport,
  items: ListedRemoteTale[],
): Promise<RemoteTale[]> {
  const session = transport.cloudEncryption;
  const visible = items.filter(
    (tale) =>
      tale.encryption !== "server" || !session || session.acceptServerTales,
  );
  const readable = session
    ? visible.filter(
        (tale) =>
          tale.encryption === "client" && tale.summary?.keyId === session.keyId,
      )
    : [];
  const summaries = readable.length
    ? await cloudKeys.decryptSummaries(
        session!,
        readable.map((tale) => ({
          taleId: tale.id,
          contentRev: tale.contentRev,
          metadataRev: tale.metadataRev,
          summary: tale.summary!,
        })),
      )
    : [];
  const summaryById = new Map(
    readable.map((tale, index) => [
      tale.id,
      parseTaleSummary(summaries[index] ?? null),
    ]),
  );
  return visible.map(({ summary: _summary, ...tale }) => {
    if (tale.encryption !== "client") return tale;
    const summary = summaryById.get(tale.id);
    if (!summary) {
      return {
        ...tale,
        locked: true,
        title: "",
        description: null,
        lastEntryPreview: null,
        cover: null,
      };
    }
    return {
      ...tale,
      title: summary.title,
      description: summary.description || null,
      lastEntryPreview: summary.lastEntryPreview,
      cover: summary.cover,
      ...(summary.migratedFrom ? { migratedFrom: summary.migratedFrom } : {}),
    };
  });
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
  const response = bodyValue(
    await transport.get(
      `/v1/tales/${encodeURIComponent(remoteTaleId)}/package`,
    ),
  );
  if (response.encryption === "client" || response.encryptedPackage) {
    return openTalePackage(transport.cloudEncryption, remoteTaleId, response);
  }
  if (
    transport.cloudEncryption &&
    !transport.cloudEncryption.acceptServerTales
  ) {
    throw cloudIntegrityError(
      "The cloud returned an unencrypted tale for an encrypted account.",
      "cloud_encryption_downgraded",
    );
  }
  return response as RemoteTalePackageResponse;
}

function entryCount(pkg: Pick<SyncTalePackageV1, "turns">) {
  return pkg.turns.reduce(
    (count, turn) =>
      count + (Array.isArray(turn.entries) ? turn.entries.length : 0),
    0,
  );
}

async function openTalePackage(
  session: CloudEncryptionSession | undefined,
  id: string,
  response: Record<string, unknown>,
): Promise<RemoteTalePackageResponse> {
  if (!session) throw cloudLockedError();
  if (response.id !== id) {
    throw cloudIntegrityError("The cloud returned a different tale.");
  }
  const encrypted = bodyValue(
    response.encryptedPackage,
  ) as unknown as EncryptedTalePackage;
  const contentRev = Number(response.contentRev);
  const metadataRev = Number(response.metadataRev);
  if (
    encrypted.keyId !== session.keyId ||
    encrypted.summary?.keyId !== session.keyId ||
    encrypted.package?.keyId !== session.keyId
  ) {
    throw new SyncHttpError(
      "This tale was encrypted with a different cloud key.",
      409,
      "cloud_key_mismatch",
    );
  }
  let plaintext: { summary: string; package: string };
  try {
    plaintext = await cloudKeys.decryptTale(
      session,
      { taleId: id, contentRev, metadataRev },
      encrypted.summary,
      encrypted.package,
    );
  } catch {
    throw cloudIntegrityError("This cloud tale could not be decrypted.");
  }
  let pkg: SyncTalePackageV1;
  try {
    pkg = JSON.parse(plaintext.package) as SyncTalePackageV1;
  } catch {
    throw cloudIntegrityError("This cloud tale could not be read.");
  }
  if (
    !pkg?.tale ||
    !pkg.state ||
    !Array.isArray(pkg.turns) ||
    encrypted.taleId !== id ||
    encrypted.gameMode !== pkg.tale.gameMode ||
    encrypted.stateSchemaVersion !== pkg.state.stateSchemaVersion ||
    encrypted.turnCount !== pkg.turns.length ||
    encrypted.entryCount !== entryCount(pkg) ||
    (encrypted.coverAssetId ?? null) !== (pkg.tale.coverAssetId ?? null) ||
    Number(response.turnCount) !== encrypted.turnCount ||
    (response.entryCount !== undefined &&
      Number(response.entryCount) !== encrypted.entryCount)
  ) {
    throw cloudIntegrityError("This cloud tale does not match its record.");
  }
  return {
    id,
    sourceTaleId: encrypted.sourceTaleId,
    contentRev,
    metadataRev,
    turnCount: encrypted.turnCount,
    entryCount: encrypted.entryCount,
    encryption: "client",
    package: pkg,
    cover: response.cover,
  };
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
  if (
    !isCloudClientCompatible(capabilities) ||
    capabilities.cloudSaveProtocol !== 1
  ) {
    throw new SyncHttpError(
      "Update Hakawati to sync.",
      426,
      "unsupported_client",
    );
  }
  if (!cloudFeatureAvailable(capabilities, "sync")) {
    throw new SyncHttpError(
      "Cloud sync is unavailable.",
      503,
      "sync_unavailable",
    );
  }
}

function localThumbnailAsset(pkg: TalePackageV1) {
  return pkg.assets.find((asset) => asset.id === pkg.tale.thumbnailAssetId);
}

type UploadedCover = Pick<
  CoverAssetReference,
  "assetId" | "contentType" | "byteSize" | "sha256"
>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const ENCRYPTED_COVER_CONTENT_TYPE = "application/octet-stream";

export async function uploadHostedCoverAsset(
  transport: SyncTransport,
  cover: {
    bytes: Uint8Array;
    contentType: string;
    width?: number;
    height?: number;
  },
): Promise<UploadedCover> {
  const { contentType, width, height } = cover;
  transport.signal?.throwIfAborted();
  const sha256 = await sha256Hex(cover.bytes);
  const session = transport.cloudEncryption;
  const encryptedAssetId = session ? crypto.randomUUID() : null;
  const bytes =
    session && encryptedAssetId
      ? base64ToBytes(
          await cloudKeys.encryptCover(
            session,
            encryptedAssetId,
            bytesToBase64(cover.bytes),
          ),
        )
      : cover.bytes;
  const uploadType = session ? ENCRYPTED_COVER_CONTENT_TYPE : contentType;
  const intent = bodyValue(
    await transport.post(
      "/v1/assets/cover-upload-intents",
      session
        ? {
            visibility: "private",
            encryption: CLOUD_ENCRYPTION_SCHEME,
            assetId: encryptedAssetId,
            contentType: uploadType,
            byteSize: bytes.byteLength,
            sha256: await sha256Hex(bytes),
          }
        : {
            visibility: "private",
            contentType,
            byteSize: bytes.byteLength,
            sha256,
            width,
            height,
          },
    ),
  );
  const upload = bodyValue(intent.upload);
  const uploadedAsset = bodyValue(intent.asset);
  const assetId =
    typeof uploadedAsset.assetId === "string" ? uploadedAsset.assetId : null;
  const uploadUrl = typeof upload.url === "string" ? upload.url : null;
  const uploadMethod =
    typeof upload.method === "string" ? upload.method : "PUT";
  const uploadHeaders = bodyValue(upload.headers) as Record<string, string>;
  if (!assetId || !uploadUrl) {
    throw new Error("Cover upload intent did not include upload details");
  }

  transport.signal?.throwIfAborted();
  const response = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: uploadHeaders,
    body: new Blob([bytes.slice().buffer], { type: uploadType }),
    ...(transport.signal ? { signal: transport.signal } : {}),
  });
  transport.signal?.throwIfAborted();
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
  return { assetId, contentType, byteSize: cover.bytes.byteLength, sha256 };
}

async function matchesExistingCover(
  existing: UploadedCover | null | undefined,
  cover: { bytes: Uint8Array; contentType: string },
): Promise<boolean> {
  return Boolean(
    existing?.assetId &&
      existing.contentType === cover.contentType &&
      existing.byteSize === cover.bytes.byteLength &&
      existing.sha256 === (await sha256Hex(cover.bytes)),
  );
}

async function findMatchingCover(
  candidates: Array<UploadedCover | null | undefined>,
  cover: { bytes: Uint8Array; contentType: string },
): Promise<UploadedCover | undefined> {
  for (const candidate of candidates) {
    if (candidate && (await matchesExistingCover(candidate, cover))) {
      return candidate;
    }
  }
  return undefined;
}

// Retries reuse uploaded covers; an unused one counts against the account.
const uploadedCovers = new Map<string, UploadedCover>();

function uploadedCoverKey(profile: SyncProfile, localTaleId: string) {
  return JSON.stringify([
    profile.id,
    syncBaseUrl(profile.baseUrl),
    profile.accountId ?? "",
    localTaleId,
  ]);
}

function forgetUploadedCover(profile: SyncProfile, localTaleId: string) {
  uploadedCovers.delete(uploadedCoverKey(profile, localTaleId));
}

function forgetCoverRejectedWith(
  error: unknown,
  profile: SyncProfile,
  localTaleId: string,
) {
  if (error instanceof SyncHttpError && error.status === 400) {
    forgetUploadedCover(profile, localTaleId);
  }
}

const jsonEncoder = new TextEncoder();

function jsonBytes(value: unknown): number {
  return jsonEncoder.encode(JSON.stringify(value)).byteLength;
}

// Same length as the asset ID the server will assign the cover.
const COVER_ASSET_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const MAX_ENCRYPTED_TURN_BYTES = 256 * 1024;
const MAX_SUMMARY_BYTES = 32 * 1024;
const PREVIEW_MAX_CHARS = 280;

function assertWithinSyncLimits(
  pkg: SyncTalePackageV1,
  capabilities: SyncCapabilities,
  encrypted = false,
) {
  if (
    jsonBytes(pkg) > capabilities.limits.maxPackageBytes ||
    jsonBytes(pkg.state.data) > capabilities.limits.maxStateBytes ||
    (encrypted &&
      pkg.turns.some(
        (turn) => jsonBytes(turn.entries) > MAX_ENCRYPTED_TURN_BYTES,
      ))
  ) {
    throw new SyncHttpError(
      "This tale is too large to sync.",
      413,
      "package_too_large",
    );
  }
}

function lastEntryPreview(pkg: SyncTalePackageV1): string | null {
  for (const turn of [...pkg.turns].reverse()) {
    for (const entry of [...turn.entries].reverse()) {
      const raw =
        typeof entry === "string"
          ? entry
          : entry && typeof entry === "object" && "text" in entry
            ? (entry as { text?: unknown }).text
            : null;
      const text =
        typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
      if (text) {
        return text.length > PREVIEW_MAX_CHARS
          ? `${text.slice(0, PREVIEW_MAX_CHARS - 1)}…`
          : text;
      }
    }
  }
  return null;
}

export async function encryptSyncPackage(
  session: CloudEncryptionContext,
  pkg: SyncTalePackageV1,
  revision: TaleRevision,
  cover: RemoteTaleCover | null,
  migratedFrom?: RemoteTaleRevisions,
): Promise<EncryptedTalePackage> {
  const summary: TaleSummary = {
    title: pkg.tale.title,
    description: pkg.tale.description,
    lastEntryPreview: lastEntryPreview(pkg),
    cover,
    ...(migratedFrom ? { migratedFrom } : {}),
  };
  if (jsonBytes(summary) > MAX_SUMMARY_BYTES) {
    throw new SyncHttpError(
      "This tale is too large to sync.",
      413,
      "package_too_large",
    );
  }
  const sealed = await cloudKeys.encryptTale(
    session,
    revision,
    JSON.stringify(summary),
    JSON.stringify(pkg),
  );
  return {
    scheme: CLOUD_ENCRYPTION_SCHEME,
    keyId: session.keyId,
    taleId: revision.taleId,
    sourceTaleId: pkg.tale.id,
    gameMode: pkg.tale.gameMode,
    stateSchemaVersion: pkg.state.stateSchemaVersion,
    turnCount: pkg.turns.length,
    entryCount: entryCount(pkg),
    coverAssetId: pkg.tale.coverAssetId ?? null,
    createdAt: pkg.tale.createdAt,
    updatedAt: pkg.tale.updatedAt,
    summary: sealed.summary,
    package: sealed.package,
  };
}

type UploadTaleBody =
  | { package: SyncTalePackageV1 }
  | { encryptedPackage: EncryptedTalePackage };

async function toUploadSyncPackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  localPackage: TalePackageV1;
  capabilities?: SyncCapabilities;
  existingCover?: RemoteTaleCover | null;
  revision?: TaleRevision;
}): Promise<UploadTaleBody> {
  const capabilities =
    input.capabilities ?? (await fetchSyncCapabilities(input.transport));
  assertSyncAvailable(capabilities);
  const session = input.transport.cloudEncryption;
  if (session && !input.revision) {
    throw new Error("Encrypted uploads need the revision they will produce");
  }
  const hosted = input.profile.mode === "hosted";
  const coverAsset = hosted
    ? localThumbnailAsset(input.localPackage)
    : undefined;
  assertWithinSyncLimits(
    toSyncTalePackage(input.localPackage, {
      mode: input.profile.mode,
      ...(hosted && (coverAsset || input.existingCover?.assetId)
        ? { coverAssetId: COVER_ASSET_ID_PLACEHOLDER }
        : {}),
    }),
    capabilities,
    Boolean(session),
  );
  // Cloud imports omit binary assets locally. Keep their existing cover on saves.
  let cover: UploadedCover | null =
    hosted && input.existingCover ? input.existingCover : null;
  if (coverAsset) {
    const original = {
      bytes: base64ToBytes(coverAsset.dataBase64),
      contentType: coverAsset.contentType,
    };
    const coverKey = uploadedCoverKey(input.profile, input.localTaleId);
    const candidates = [input.existingCover, uploadedCovers.get(coverKey)];
    // Retain previously uploaded originals; optimize only when an upload is needed.
    const kept = await findMatchingCover(candidates, original);
    if (kept) {
      cover = kept;
    } else if (canUploadCoverAssets(capabilities)) {
      const optimized = await optimizeCoverImage(original);
      input.transport.signal?.throwIfAborted();
      const uploaded =
        (await findMatchingCover(candidates, optimized)) ??
        (await uploadHostedCoverAsset(input.transport, optimized));
      uploadedCovers.set(coverKey, uploaded);
      cover = uploaded;
    }
  }
  const pkg = toSyncTalePackage(input.localPackage, {
    mode: input.profile.mode,
    ...(cover?.assetId ? { coverAssetId: cover.assetId } : {}),
  });
  if (!session || !input.revision) return { package: pkg };
  return {
    encryptedPackage: await encryptSyncPackage(
      session,
      pkg,
      input.revision,
      cover?.assetId
        ? {
            assetId: cover.assetId,
            contentType: cover.contentType,
            byteSize: cover.byteSize,
            sha256: cover.sha256,
          }
        : null,
    ),
  };
}

const ABANDONED_WRITE_STATUSES = new Set([400, 404, 409, 410, 413, 422]);

function abandonsStoredWrite(error: unknown) {
  return (
    error instanceof SyncHttpError &&
    ABANDONED_WRITE_STATUSES.has(error.status) &&
    error.code !== "idempotency_in_progress"
  );
}

// A rebuilt encrypted body differs from the lost one, so a retry under the same
// idempotency key resends the stored bytes.
export async function sendStoredWrite(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  writeKey: string;
  idempotencyKey: string;
  method: "POST" | "PUT";
  path: string;
  build: () => Promise<{ body: unknown; saveVersion: number | null }>;
}): Promise<{ result: Record<string, unknown>; saveVersion: number | null }> {
  const scope = {
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    writeKey: input.writeKey,
  };
  const stored = await getPendingSyncWrite(scope);
  let write =
    stored &&
    stored.idempotencyKey === input.idempotencyKey &&
    stored.method === input.method &&
    stored.path === input.path
      ? stored
      : null;
  if (!write) {
    const built = await input.build();
    input.transport.signal?.throwIfAborted();
    write = {
      idempotencyKey: input.idempotencyKey,
      method: input.method,
      path: input.path,
      body: JSON.stringify(built.body),
      saveVersion: built.saveVersion,
    };
    await savePendingSyncWrite({ ...scope, ...write });
  }
  const send =
    input.method === "POST" ? input.transport.post : input.transport.put;
  try {
    const result = bodyValue(
      await send(input.path, undefined, {
        idempotencyKey: write.idempotencyKey,
        rawBody: write.body,
      }),
    );
    await deletePendingSyncWrite({
      ...scope,
      idempotencyKey: write.idempotencyKey,
    });
    return { result, saveVersion: write.saveVersion };
  } catch (error) {
    if (abandonsStoredWrite(error)) {
      await deletePendingSyncWrite({
        ...scope,
        idempotencyKey: write.idempotencyKey,
      });
    }
    throw error;
  }
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

function comparableTalePackage(pkg: SyncTalePackageV1) {
  return {
    tale: {
      id: pkg.tale.id,
      title: pkg.tale.title,
      description: pkg.tale.description,
      gameMode: pkg.tale.gameMode,
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
  if (
    stableJson(
      comparableTalePackage(
        toSyncTalePackage(localPackage, { mode: input.profile.mode }),
      ),
    ) !== stableJson(comparableTalePackage(remote.package))
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

const REVISION_CONFLICT_CODES = new Set([
  "content_conflict",
  "metadata_conflict",
]);

function syncFailureStatus(error: unknown): "conflict" | "error" {
  return error instanceof SyncHttpError &&
    error.status === 409 &&
    REVISION_CONFLICT_CODES.has(error.code)
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
  writerId: string;
  capabilities?: SyncCapabilities;
  canPull?: () => boolean;
}): Promise<LinkedTaleSyncResult> {
  const stored = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!stored || stored.remoteTaleId !== input.remoteTale.id) {
    return "skipped";
  }
  if (stored.pendingStatus === "conflict") {
    return "skipped";
  }
  const state = await adoptMigratedRevisions(
    input.profile,
    stored,
    input.remoteTale,
  );

  // A dirty tale may include edits to earlier turns as well as new turns.
  // Replace one complete snapshot: turn count alone cannot prove append-only
  // history, and a separate metadata write can acknowledge unfinished content.
  const push = async (base: TaleSyncState) => {
    await replaceRemoteTalePackage({
      profile: input.profile,
      transport: input.transport,
      localTaleId: input.localTaleId,
      idempotencyKey: await createLinkedWriteIdempotencyKey(
        input.profile.id,
        input.writerId,
        input.localTaleId,
        base.contentRev,
        base.metadataRev,
      ),
      capabilities: input.capabilities,
      existingCover:
        input.remoteTale.cover?.assetId === input.remoteTale.coverAssetId
          ? input.remoteTale.cover
          : undefined,
    });
    return "pushed" as const;
  };
  const refused =
    state.pendingStatus === "error" && isRefusedSyncError(state.lastErrorCode);
  const remoteChanged = remoteTaleChanged(state, input.remoteTale);

  if (remoteChanged && hasLocalPendingWork(state)) {
    if (!refused) {
      if (
        state.pendingStatus === "error" &&
        (await reconcileAmbiguousSuccessfulSync({
          profile: input.profile,
          transport: input.transport,
          state,
          localTaleId: input.localTaleId,
        }))
      ) {
        return "pushed";
      }
      const resumed = await resumeAfterOwnWrite(input, state, push);
      if (resumed) return resumed;
    }
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
    const pulled = await pullRemoteTalePackage({
      profile: input.profile,
      transport: input.transport,
      localTaleId: input.localTaleId,
      requireClean: true,
      canReplace: input.canPull,
    });
    return pulled === "deferred" ? "skipped" : pulled;
  }

  if (!hasLocalPendingWork(state) || refused) {
    return "skipped";
  }
  return push(state);
}

// The summary's revisions are authenticated, so only a re-encryption of the
// revision this device last synced is skipped over.
async function adoptMigratedRevisions(
  profile: SyncProfile,
  state: TaleSyncState,
  remote: RemoteTale,
): Promise<TaleSyncState> {
  const from = remote.migratedFrom;
  if (
    remote.encryption !== "client" ||
    !from ||
    state.contentRev === null ||
    state.metadataRev === null ||
    Number(state.contentRev) !== from.contentRev ||
    Number(state.metadataRev) !== from.metadataRev ||
    remote.contentRev !== from.contentRev + 1 ||
    remote.metadataRev !== from.metadataRev + 1
  ) {
    return state;
  }
  const adopted = await advanceMigratedTaleRevisions({
    profileId: profile.id,
    accountId: profile.accountId,
    remoteTaleId: remote.id,
    baseContentRev: from.contentRev,
    baseMetadataRev: from.metadataRev,
    contentRev: remote.contentRev,
    metadataRev: remote.metadataRev,
  });
  return adopted
    ? {
        ...state,
        contentRev: String(remote.contentRev),
        metadataRev: String(remote.metadataRev),
      }
    : state;
}

// For a write that landed but whose response was lost.
async function resumeAfterOwnWrite(
  input: { profile: SyncProfile; localTaleId: string; remoteTale: RemoteTale },
  state: TaleSyncState,
  push: (base: TaleSyncState) => Promise<"pushed">,
): Promise<"pushed" | "conflict" | null> {
  const remote = input.remoteTale;
  if (state.contentRev === null && state.metadataRev === null) {
    // A lost create; a cloud copy still at revision 1 has had no other writes.
    if (remote.contentRev !== 1 || remote.metadataRev !== 1) return null;
  } else {
    // A replace bumps both revisions, so exactly one write followed the link.
    if (
      remote.contentRev !== Number(state.contentRev) + 1 ||
      remote.metadataRev !== Number(state.metadataRev) + 1
    ) {
      return null;
    }
    // The lost write's key; the server refuses a reused key only if it landed.
    try {
      return await push(state);
    } catch (error) {
      if (!(error instanceof SyncHttpError)) throw error;
      if (syncFailureStatus(error) === "conflict") return "conflict";
      if (error.code !== "idempotency_conflict") throw error;
    }
  }
  const adopted = {
    ...state,
    contentRev: String(remote.contentRev),
    metadataRev: String(remote.metadataRev),
  };
  if (
    !(await adoptTaleSyncRevisions({
      expectedState: state,
      contentRev: adopted.contentRev,
      metadataRev: adopted.metadataRev,
    }))
  ) {
    return null;
  }
  return push(adopted);
}

type LocalTaleAsset = TalePackageV1["assets"][number];

async function downloadRemoteCover(
  transport: SyncTransport,
  remote: RemoteTalePackageResponse,
): Promise<LocalTaleAsset | null> {
  const assetId =
    remote.package.tale.coverAssetId ?? remote.package.tale.thumbnailAssetId;
  const reference = bodyValue(remote.cover);
  if (
    !assetId ||
    !transport.getBytes ||
    typeof reference.assetId !== "string" ||
    reference.assetId.toLowerCase() !== assetId.toLowerCase()
  ) {
    return null;
  }
  const encrypted =
    remote.encryption === "client" || reference.encryption === "client";
  const session = transport.cloudEncryption;
  if (encrypted && !session) return null;
  try {
    const object = await transport.getBytes(
      `/v1/assets/${encodeURIComponent(assetId)}/download`,
    );
    const image =
      encrypted && session
        ? base64ToBytes(
            await cloudKeys.decryptCover(
              session,
              assetId,
              bytesToBase64(object),
            ),
          )
        : object;
    const contentType = detectCoverImageContentType(image);
    if (!contentType) return null;
    return {
      id: assetId,
      role: "thumbnail",
      contentType,
      dataBase64: bytesToBase64(image),
    };
  } catch {
    transport.signal?.throwIfAborted();
    return null;
  }
}

function toLocalTalePackage(
  pkg: RemoteTalePackageResponse["package"],
  cover: LocalTaleAsset | null = null,
): TalePackageV1 {
  const assets = cover
    ? [cover]
    : (pkg.assets ?? []).filter(
        (asset): asset is LocalTaleAsset =>
          typeof asset.dataBase64 === "string",
      );
  const assetIds = new Set(assets.map((asset) => asset.id));
  const { thumbnailAssetId, coverAssetId, ...tale } = pkg.tale;
  const localThumbnailAssetId =
    cover?.id ?? thumbnailAssetId ?? coverAssetId ?? undefined;

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
  signal?: AbortSignal;
  device: Omit<RegisterSyncDeviceInput, "id">;
  getDeviceIdForAccount: (accountId: string) => string;
}): Promise<{
  capabilities: SyncCapabilities;
  authConfig: HostedAuthConfig;
  account: HostedAccount;
  device: SyncDevice | null;
  transport: SyncTransport;
}> {
  const publicTransport = createSyncTransport({
    profile: input.profile,
    signal: input.signal,
  });
  const capabilities = await fetchSyncCapabilities(publicTransport);
  assertSyncAvailable(capabilities);
  const authConfig = await fetchHostedAuthConfig(publicTransport);
  const accountTransport = createSyncTransport({
    profile: input.profile,
    accessToken: input.accessToken,
    signal: input.signal,
  });
  const account = await getHostedAccount(accountTransport);
  const deviceId = input.getDeviceIdForAccount(account.id);
  const profile = { ...input.profile, accountId: account.id, deviceId };
  input.signal?.throwIfAborted();
  await upsertSyncProfile(profile);
  const transport = createSyncTransport({
    profile,
    accessToken: input.accessToken,
    signal: input.signal,
  });
  let device: SyncDevice;
  try {
    device = await registerSyncDevice(transport, {
      ...input.device,
      id: deviceId,
    });
  } catch (error) {
    input.signal?.throwIfAborted();
    if (isDeviceLimitError(error)) {
      await setSyncProfileDisabled(profile.id, "device_limit");
      return { capabilities, authConfig, account, device: null, transport };
    }
    throw error;
  }
  input.signal?.throwIfAborted();
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
  input.transport.signal?.throwIfAborted();
  await upsertSyncProfile(input.profile);

  try {
    let expectedSaveVersion: number;
    let result: Record<string, unknown>;
    if (input.transport.cloudEncryption) {
      const sent = await sendStoredWrite({
        profile: input.profile,
        transport: input.transport,
        writeKey: `tale:${input.localTaleId}`,
        idempotencyKey: input.idempotencyKey,
        method: "POST",
        path: "/v1/tales",
        build: async () => {
          const saveVersion = await getTaleSaveVersion(input.localTaleId);
          const pkg = await exportTalePackage(input.localTaleId);
          return {
            saveVersion,
            body: await toUploadSyncPackage({
              profile: input.profile,
              transport: input.transport,
              localTaleId: input.localTaleId,
              localPackage: pkg,
              capabilities: input.capabilities,
              revision: {
                taleId: crypto.randomUUID(),
                contentRev: 1,
                metadataRev: 1,
              },
            }),
          };
        },
      });
      result = sent.result;
      expectedSaveVersion =
        sent.saveVersion ?? (await getTaleSaveVersion(input.localTaleId));
    } else {
      expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
      const pkg = await exportTalePackage(input.localTaleId);
      const body = await toUploadSyncPackage({
        profile: input.profile,
        transport: input.transport,
        localTaleId: input.localTaleId,
        localPackage: pkg,
        capabilities: input.capabilities,
      });
      result = bodyValue(
        await input.transport.post("/v1/tales", body, {
          idempotencyKey: input.idempotencyKey,
        }),
      );
    }
    forgetUploadedCover(input.profile, input.localTaleId);
    const remoteTaleId =
      typeof result.id === "string" && result.id.trim().length > 0
        ? result.id
        : null;
    if (!remoteTaleId) {
      throw new SyncHttpError(
        "Cloud save did not return a remote tale ID.",
        502,
        "invalid_create_response",
      );
    }
    const linked = await setTaleSynced({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      result,
      remoteTaleId,
      contentRev: null,
      metadataRev: null,
      expectedSaveVersion,
    });
    if (!linked) {
      await upsertTaleSyncState({
        profileId: input.profile.id,
        accountId: input.profile.accountId,
        localTaleId: input.localTaleId,
        remoteTaleId,
        contentRev: rev(result.contentRev),
        metadataRev: rev(result.metadataRev),
        lastSyncedAt: null,
        pendingStatus: "push",
        lastErrorCode: null,
      });
    }
  } catch (error) {
    input.transport.signal?.throwIfAborted();
    if (input.profile.mode === "hosted" && isDeviceLimitError(error)) {
      await setSyncProfileDisabled(input.profile.id, "device_limit");
    }
    if (input.profile.mode === "hosted" && isUnregisteredDeviceError(error)) {
      await setSyncProfileDisabled(input.profile.id, "user_disabled");
    }
    forgetCoverRejectedWith(error, input.profile, input.localTaleId);
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
  existingCover?: RemoteTaleCover | null;
  remoteRevisions?: { contentRev: number; metadataRev: number };
}): Promise<unknown> {
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }

  const path = `/v1/tales/${encodeURIComponent(state.remoteTaleId)}/package`;
  let expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const pkg = input.transport.cloudEncryption
    ? null
    : await exportTalePackage(input.localTaleId);
  try {
    let result: Record<string, unknown>;
    if (!pkg) {
      const sent = await sendStoredWrite({
        profile: input.profile,
        transport: input.transport,
        writeKey: `tale:${input.localTaleId}`,
        idempotencyKey: input.idempotencyKey,
        method: "PUT",
        path,
        build: async () => {
          // Encrypted replaces always name the revision they replace.
          const base = input.forceReplace
            ? (input.remoteRevisions ??
              (await downloadRemoteTalePackage(
                input.transport,
                state.remoteTaleId,
              )))
            : {
                contentRev: revisionNumber(state.contentRev, "content"),
                metadataRev: revisionNumber(state.metadataRev, "metadata"),
              };
          const localPackage = await exportTalePackage(input.localTaleId);
          return {
            saveVersion: expectedSaveVersion,
            body: {
              ...(await toUploadSyncPackage({
                profile: input.profile,
                transport: input.transport,
                localTaleId: input.localTaleId,
                localPackage,
                capabilities: input.capabilities,
                existingCover: input.existingCover,
                revision: {
                  taleId: state.remoteTaleId,
                  contentRev: base.contentRev + 1,
                  metadataRev: base.metadataRev + 1,
                },
              })),
              baseContentRev: base.contentRev,
              baseMetadataRev: base.metadataRev,
              confirmReplace: true,
            },
          };
        },
      });
      result = sent.result;
      expectedSaveVersion = sent.saveVersion ?? expectedSaveVersion;
    } else {
      const body: UploadTaleBody & {
        confirmReplace: true;
        baseContentRev?: number;
        baseMetadataRev?: number;
      } = {
        ...(await toUploadSyncPackage({
          profile: input.profile,
          transport: input.transport,
          localTaleId: input.localTaleId,
          localPackage: pkg,
          capabilities: input.capabilities,
          existingCover: input.existingCover,
        })),
        confirmReplace: true,
      };
      if (!input.forceReplace) {
        body.baseContentRev = revisionNumber(state.contentRev, "content");
        body.baseMetadataRev = revisionNumber(state.metadataRev, "metadata");
      }
      result = bodyValue(
        await input.transport.put(path, body, {
          idempotencyKey: input.idempotencyKey,
        }),
      );
    }
    input.transport.signal?.throwIfAborted();
    forgetUploadedCover(input.profile, input.localTaleId);
    await acknowledgeTaleSyncWrite({
      expectedState: state,
      expectedSaveVersion,
      contentRev: rev(result.contentRev) ?? state.contentRev,
      metadataRev: rev(result.metadataRev) ?? state.metadataRev,
    });
    return result;
  } catch (error) {
    input.transport.signal?.throwIfAborted();
    forgetCoverRejectedWith(error, input.profile, input.localTaleId);
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
  const applied = await applyRemoteTalePackage({
    profile: input.profile,
    transport: input.transport,
    localTaleId: input.localTaleId,
  });
  if (!applied) {
    throw new SyncHttpError(
      "The local copy was saved, but the original tale changed while resolving the conflict. Review it and try again.",
      409,
      "local_changed",
    );
  }
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
  input.transport.signal?.throwIfAborted();
  const cover = await downloadRemoteCover(input.transport, remote);
  input.transport.signal?.throwIfAborted();
  const localTaleId = await importTalePackage(
    toLocalTalePackage(remote.package, cover),
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
  requireClean?: boolean;
  canReplace?: () => boolean;
}): Promise<boolean> {
  return (await pullRemoteTalePackage(input)) === "pulled";
}

async function pullRemoteTalePackage(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  localTaleId: string;
  requireClean?: boolean;
  canReplace?: () => boolean;
}): Promise<"pulled" | "deferred" | "conflict"> {
  // Read the version before the link status. A save before this snapshot is
  // detected as dirty; a later save is rejected by the replacement CAS.
  const expectedSaveVersion = await getTaleSaveVersion(input.localTaleId);
  const state = await getTaleSyncState({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    localTaleId: input.localTaleId,
  });
  if (!state) {
    throw new Error("Tale is not linked to this sync profile");
  }
  const markLocalChanged = async () => {
    await setTaleSyncStatus({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      localTaleId: input.localTaleId,
      pendingStatus: "conflict",
      lastErrorCode: "local_changed",
    });
    return "conflict" as const;
  };

  if (
    input.requireClean &&
    (hasLocalPendingWork(state) || state.pendingStatus === "conflict")
  ) {
    return markLocalChanged();
  }
  let deferred = false;
  const canReplace =
    input.canReplace &&
    (() => {
      deferred = input.canReplace?.() === false;
      return !deferred;
    });
  if (canReplace?.() === false) return "deferred";
  let remote: RemoteTalePackageResponse;
  try {
    remote = await downloadRemoteTalePackage(
      input.transport,
      state.remoteTaleId,
    );
  } catch (error) {
    input.transport.signal?.throwIfAborted();
    if (input.requireClean) {
      // A failed read is pending pull work, not an unsent local edit. Preserve
      // any local save made while the request was pending.
      await upsertTaleSyncStateIfTaleVersion(
        {
          ...state,
          pendingStatus: "pull",
          lastErrorCode:
            error instanceof SyncHttpError ? error.code : "sync_failed",
        },
        expectedSaveVersion,
      );
    }
    throw error;
  }
  input.transport.signal?.throwIfAborted();
  if (
    remote.encryption === "client" &&
    state.contentRev !== null &&
    remote.contentRev < Number(state.contentRev)
  ) {
    throw cloudIntegrityError(
      "The cloud returned an older version of this tale.",
      "cloud_rollback",
    );
  }
  const cover = await downloadRemoteCover(input.transport, remote);
  input.transport.signal?.throwIfAborted();
  const replaced = await replaceTaleWithPackage(
    input.localTaleId,
    toLocalTalePackage(remote.package, cover),
    {
      expectedSaveVersion,
      // Rechecked inside the write queue in case play began meanwhile.
      ...(canReplace ? { canReplace } : {}),
    },
  );
  if (replaced === false) {
    return deferred ? "deferred" : markLocalChanged();
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
  return "pulled";
}
