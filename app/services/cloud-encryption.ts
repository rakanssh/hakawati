import { create } from "zustand";
import { asApiObject } from "@/services/api-error";
import {
  advanceMigratedTaleRevisions,
  deletePendingSyncWrite,
  getPendingSyncWrite,
  relinkTalesAfterCloudReset,
  savePendingSyncWrite,
} from "@/repositories/sync.repository";
import {
  CLOUD_ENCRYPTION_SCHEME,
  cloudKeys,
  type CloudEnvelope,
  type CloudKeyScope,
  type CloudKeySetup,
  type CloudPairingPayload,
  type PairingDirection,
} from "@/services/cloud-keys";
import {
  cloudLockedError,
  downloadRemoteTalePackage,
  encryptSyncPackage,
  sendStoredWrite,
  SyncHttpError,
  uploadHostedCoverAsset,
  withCloudEncryption,
  type CloudEncryptionSession,
  type SyncCapabilities,
  type SyncTalePackageV1,
  type SyncTransport,
} from "@/services/sync";
import { createLinkedWriteIdempotencyKey } from "@/lib/sync-idempotency";
import type { CoverAssetReference } from "@/types/catalog.type";
import type {
  RemoteTale,
  RemoteTaleCover,
  SyncProfile,
} from "@/types/sync.type";

export type AccountCloudEncryption = "server" | "migrating" | "client";

export type CloudKeyInfo = {
  state: AccountCloudEncryption;
  keyId: string | null;
  keyCheck: string | null;
  recoveryWrappedKey: CloudEnvelope | null;
  serverTaleCount: number;
};

export type CloudEncryptionStatus =
  | { kind: "ready"; session: CloudEncryptionSession; info: CloudKeyInfo }
  | { kind: "setup"; info: CloudKeyInfo }
  | { kind: "locked"; reason: "missing" | "changed"; info: CloudKeyInfo }
  | { kind: "paused"; reason: "downgraded" | "unsupported" }
  | { kind: "plaintext" };

const CLOUD_KEY_PATH = "/v1/accounts/me/cloud-key";

function parseCloudKey(value: unknown): CloudKeyInfo {
  const body = asApiObject(value);
  const state =
    body.state === "migrating" || body.state === "client"
      ? body.state
      : "server";
  return {
    state,
    keyId: typeof body.keyId === "string" ? body.keyId : null,
    keyCheck: typeof body.keyCheck === "string" ? body.keyCheck : null,
    recoveryWrappedKey:
      body.recoveryWrappedKey && typeof body.recoveryWrappedKey === "object"
        ? (body.recoveryWrappedKey as CloudEnvelope)
        : null,
    serverTaleCount:
      typeof body.serverTaleCount === "number" ? body.serverTaleCount : 0,
  };
}

export async function fetchCloudKey(
  transport: SyncTransport,
): Promise<CloudKeyInfo> {
  return parseCloudKey(await transport.get(CLOUD_KEY_PATH));
}

export async function putCloudKey(
  transport: SyncTransport,
  setup: Pick<CloudKeySetup, "keyId" | "keyCheck" | "recoveryWrappedKey">,
): Promise<CloudKeyInfo> {
  return parseCloudKey(
    await transport.put(CLOUD_KEY_PATH, {
      keyId: setup.keyId,
      keyCheck: setup.keyCheck,
      recoveryWrappedKey: setup.recoveryWrappedKey,
    }),
  );
}

export async function replaceCloudRecovery(
  transport: SyncTransport,
  body: { keyProof: string; recoveryWrappedKey: CloudEnvelope },
): Promise<CloudKeyInfo> {
  return parseCloudKey(await transport.put(`${CLOUD_KEY_PATH}/recovery`, body));
}

export async function completeCloudMigration(
  transport: SyncTransport,
  keyProof: string,
): Promise<CloudKeyInfo> {
  return parseCloudKey(
    await transport.post(`${CLOUD_KEY_PATH}/complete-migration`, { keyProof }),
  );
}

export async function resetCloudSaves(
  transport: SyncTransport,
  keyId: string,
): Promise<CloudKeyInfo> {
  return parseCloudKey(
    await transport.post(`${CLOUD_KEY_PATH}/reset`, {
      confirmDeleteCloudSaves: true,
      keyId,
    }),
  );
}

export type CloudPairing = {
  id: string;
  direction: PairingDirection;
  status: "open" | "joined" | "delivered" | "completed" | "cancelled";
  role: "shower" | "scanner";
  expiresAt: string;
  scanner: {
    publicKey: string;
    confirm: string;
    device: { name?: string; platform?: string } | null;
  } | null;
  payload: CloudPairingPayload | null;
};

const PAIRINGS_PATH = "/v1/cloud-key/pairings";

function pairingPath(id: string, action = "") {
  return `${PAIRINGS_PATH}/${encodeURIComponent(id)}${action}`;
}

export const cloudPairings = {
  create: async (transport: SyncTransport, direction: PairingDirection) =>
    (await transport.post(PAIRINGS_PATH, { direction })) as CloudPairing,
  get: async (transport: SyncTransport, id: string) =>
    (await transport.get(pairingPath(id))) as CloudPairing,
  join: async (
    transport: SyncTransport,
    id: string,
    body: {
      scannerPublicKey: string;
      scannerConfirm: string;
      payload?: CloudPairingPayload;
    },
  ) => (await transport.post(pairingPath(id, "/join"), body)) as CloudPairing,
  deliver: async (
    transport: SyncTransport,
    id: string,
    payload: CloudPairingPayload,
  ) =>
    (await transport.post(pairingPath(id, "/payload"), {
      payload,
    })) as CloudPairing,
  complete: async (transport: SyncTransport, id: string) =>
    (await transport.post(pairingPath(id, "/complete"), {})) as CloudPairing,
  cancel: async (transport: SyncTransport, id: string) => {
    await transport.delete(pairingPath(id));
  },
};

export function cloudKeyScope(profile: SyncProfile): CloudKeyScope | null {
  if (!profile.accountId) return null;
  try {
    return {
      serverOrigin: new URL(profile.baseUrl).origin,
      accountId: profile.accountId,
    };
  } catch {
    return null;
  }
}

function scopeKey(scope: CloudKeyScope) {
  return `${scope.serverOrigin} ${scope.accountId}`;
}

type CloudEncryptionStore = {
  scope: string | null;
  status: CloudEncryptionStatus | null;
  checkedAt: number;
  setStatus: (scope: string, status: CloudEncryptionStatus | null) => void;
};

export const useCloudEncryptionStore = create<CloudEncryptionStore>((set) => ({
  scope: null,
  status: null,
  checkedAt: 0,
  setStatus: (scope, status) =>
    set({ scope, status, checkedAt: status ? Date.now() : 0 }),
}));

export function cloudEncryptionStatusFor(profile: SyncProfile) {
  const scope = cloudKeyScope(profile);
  const state = useCloudEncryptionStore.getState();
  return scope && state.scope === scopeKey(scope) ? state.status : null;
}

export function forgetCloudEncryptionStatus() {
  useCloudEncryptionStore.getState().setStatus("", null);
}

function hasCloudEncryption(capabilities: SyncCapabilities) {
  return Boolean(
    capabilities.cloudEncryption?.includes(CLOUD_ENCRYPTION_SCHEME),
  );
}

async function ready(
  scope: CloudKeyScope,
  keyId: string,
  info: CloudKeyInfo,
  migrated: boolean,
): Promise<CloudEncryptionStatus> {
  if (migrated && info.state !== "client") {
    return { kind: "paused", reason: "downgraded" };
  }
  if (!migrated && info.state === "client") {
    await cloudKeys.markMigrated({ ...scope, keyId });
  }
  return {
    kind: "ready",
    info,
    session: { ...scope, keyId, acceptServerTales: info.state !== "client" },
  };
}

const RESET_WRITE_KEY = "cloud-reset";
const resetsInFlight = new Set<string>();

async function finishInterruptedReset(
  profile: SyncProfile,
  scope: CloudKeyScope,
  info: CloudKeyInfo,
) {
  const write = {
    profileId: profile.id,
    accountId: profile.accountId,
    writeKey: RESET_WRITE_KEY,
  };
  const stored = await getPendingSyncWrite(write);
  if (!stored || resetsInFlight.has(scopeKey(scope))) return;
  const { keyId } = JSON.parse(stored.body) as { keyId: string };
  if (info.keyId === keyId) {
    await deletePendingSyncWrite(write);
    return;
  }
  if ((await cloudKeys.local(scope)).keyId === keyId) {
    await cloudKeys.forget(scope);
  }
  await relinkTalesAfterCloudReset(profile.id, profile.accountId);
}

// Compares this device's record with what the server reports, per the
// end-to-end encryption design's client state table.
async function evaluateCloudEncryption(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  capabilities: SyncCapabilities;
}): Promise<CloudEncryptionStatus> {
  const scope = cloudKeyScope(input.profile);
  const supported = hasCloudEncryption(input.capabilities);
  if (!scope) {
    return input.profile.mode === "personal" && !supported
      ? { kind: "plaintext" }
      : { kind: "paused", reason: "unsupported" };
  }
  if (!supported) {
    if ((await cloudKeys.local(scope)).keyId) {
      return { kind: "paused", reason: "downgraded" };
    }
    return input.profile.mode === "personal"
      ? { kind: "plaintext" }
      : { kind: "paused", reason: "unsupported" };
  }
  const info = await fetchCloudKey(input.transport);
  await finishInterruptedReset(input.profile, scope, info);
  let local = await cloudKeys.local(scope);

  if (local.pendingKeyId) {
    if (
      info.keyId === local.pendingKeyId &&
      info.keyCheck &&
      (await cloudKeys.adopt(scope, info.keyId, info.keyCheck))
    ) {
      local = {
        keyId: info.keyId,
        hasKey: true,
        pendingKeyId: null,
        migrated: false,
      };
    } else if (info.keyId !== null) {
      await cloudKeys.discardPending(scope);
    }
  }

  if (local.keyId && info.state === "server") {
    return { kind: "paused", reason: "downgraded" };
  }
  if (info.keyId === null) return { kind: "setup", info };
  if (local.keyId === info.keyId) {
    return local.hasKey
      ? ready(scope, info.keyId, info, local.migrated)
      : { kind: "locked", reason: "missing", info };
  }
  if (
    info.keyCheck &&
    (await cloudKeys.adopt(scope, info.keyId, info.keyCheck))
  ) {
    return ready(scope, info.keyId, info, false);
  }
  return {
    kind: "locked",
    reason: local.keyId ? "changed" : "missing",
    info,
  };
}

const STATUS_TTL_MS = 30_000;

export async function resolveCloudEncryption(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  capabilities: SyncCapabilities;
  maxAgeMs?: number;
}): Promise<CloudEncryptionStatus> {
  const scope = cloudKeyScope(input.profile);
  const key = scope ? scopeKey(scope) : "";
  const cached = useCloudEncryptionStore.getState();
  if (
    cached.status &&
    cached.scope === key &&
    Date.now() - cached.checkedAt < (input.maxAgeMs ?? STATUS_TTL_MS)
  ) {
    return cached.status;
  }
  const status = await evaluateCloudEncryption(input);
  input.transport.signal?.throwIfAborted();
  useCloudEncryptionStore.getState().setStatus(key, status);
  return status;
}

export function cloudEncryptionPausedError(
  status: Exclude<CloudEncryptionStatus, { kind: "ready" | "plaintext" }>,
) {
  if (status.kind === "paused") {
    return new SyncHttpError(
      status.reason === "downgraded"
        ? "The cloud stopped encrypting saves. Sync is paused."
        : "This cloud service does not support encrypted saves.",
      409,
      status.reason === "downgraded"
        ? "cloud_encryption_downgraded"
        : "cloud_encryption_unsupported",
    );
  }
  if (status.kind === "setup") {
    return new SyncHttpError(
      "Set up encryption to sync.",
      423,
      "cloud_setup_required",
    );
  }
  return cloudLockedError();
}

export async function openPrivateTransport(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  capabilities: SyncCapabilities;
  allowLocked?: boolean;
}): Promise<SyncTransport> {
  const status = await resolveCloudEncryption(input);
  if (status.kind === "ready") {
    return withCloudEncryption(input.transport, status.session);
  }
  if (status.kind === "plaintext" || input.allowLocked) return input.transport;
  throw cloudEncryptionPausedError(status);
}

export async function finishCloudKeySetup(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  setup: CloudKeySetup;
}): Promise<void> {
  const scope = cloudKeyScope(input.profile);
  if (!scope) throw new Error("Sign in to set up encryption");
  let info: CloudKeyInfo;
  try {
    info = await putCloudKey(input.transport, input.setup);
  } catch (error) {
    if (error instanceof SyncHttpError && error.code === "cloud_key_exists") {
      await cloudKeys.discardPending(scope);
    }
    forgetCloudEncryptionStatus();
    throw error;
  }
  if (
    info.keyId !== input.setup.keyId ||
    !(await cloudKeys.adopt(scope, input.setup.keyId, input.setup.keyCheck))
  ) {
    throw new SyncHttpError(
      "The cloud did not keep this key.",
      409,
      "cloud_key_exists",
    );
  }
  forgetCloudEncryptionStatus();
}

export async function resetCloudEncryption(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  keyId: string;
}): Promise<void> {
  const scope = cloudKeyScope(input.profile);
  if (!scope) throw new Error("Sign in to reset cloud saves");
  const write = {
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    writeKey: RESET_WRITE_KEY,
  };
  await savePendingSyncWrite({
    ...write,
    idempotencyKey: input.keyId,
    method: "POST",
    path: `${CLOUD_KEY_PATH}/reset`,
    body: JSON.stringify({ confirmDeleteCloudSaves: true, keyId: input.keyId }),
    saveVersion: null,
  });
  resetsInFlight.add(scopeKey(scope));
  try {
    await resetCloudSaves(input.transport, input.keyId);
  } catch (error) {
    if (error instanceof SyncHttpError && error.status < 500) {
      await deletePendingSyncWrite(write);
    }
    forgetCloudEncryptionStatus();
    throw error;
  } finally {
    resetsInFlight.delete(scopeKey(scope));
  }
  await cloudKeys.forget(scope);
  await relinkTalesAfterCloudReset(input.profile.id, input.profile.accountId);
  forgetCloudEncryptionStatus();
}

async function migrateCover(
  transport: SyncTransport,
  cover: unknown,
): Promise<RemoteTaleCover | null> {
  const reference = cover as CoverAssetReference | null | undefined;
  if (!reference?.assetId || !reference.contentType) return null;
  if (!transport.getBytes) {
    throw new Error("This connection cannot download covers");
  }
  const bytes = await transport.getBytes(
    `/v1/assets/${encodeURIComponent(reference.assetId)}/download`,
  );
  return uploadHostedCoverAsset(transport, {
    bytes,
    contentType: reference.contentType,
  });
}

function withCover(
  pkg: SyncTalePackageV1,
  cover: RemoteTaleCover | null,
): SyncTalePackageV1 {
  const {
    coverAssetId: _coverAssetId,
    thumbnailAssetId: _thumbnailAssetId,
    ...tale
  } = pkg.tale;
  return {
    ...pkg,
    tale: cover
      ? {
          ...tale,
          coverAssetId: cover.assetId,
          thumbnailAssetId: cover.assetId,
        }
      : tale,
  };
}

function isRevisionConflict(error: unknown) {
  return (
    error instanceof SyncHttpError &&
    error.status === 409 &&
    (error.code === "content_conflict" || error.code === "metadata_conflict")
  );
}

async function migrateTale(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  session: CloudEncryptionSession;
  remoteTaleId: string;
}) {
  const path = `/v1/tales/${encodeURIComponent(input.remoteTaleId)}/package`;
  const writeKey = `migrate:${input.remoteTaleId}`;
  const advance = (
    base: { baseContentRev: number; baseMetadataRev: number },
    result: Record<string, unknown>,
  ) =>
    advanceMigratedTaleRevisions({
      profileId: input.profile.id,
      accountId: input.profile.accountId,
      remoteTaleId: input.remoteTaleId,
      baseContentRev: base.baseContentRev,
      baseMetadataRev: base.baseMetadataRev,
      contentRev: Number(result.contentRev),
      metadataRev: Number(result.metadataRev),
    });

  const stored = await getPendingSyncWrite({
    profileId: input.profile.id,
    accountId: input.profile.accountId,
    writeKey,
  });
  if (stored?.method === "PUT" && stored.path === path) {
    try {
      const { result } = await sendStoredWrite({
        ...input,
        writeKey,
        idempotencyKey: stored.idempotencyKey,
        method: "PUT",
        path,
        build: () => Promise.reject(new Error("Stored write disappeared")),
      });
      await advance(
        JSON.parse(stored.body) as {
          baseContentRev: number;
          baseMetadataRev: number;
        },
        result,
      );
      return;
    } catch (error) {
      if (!(error instanceof SyncHttpError) || error.status !== 409) {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remote = await downloadRemoteTalePackage(
      input.transport,
      input.remoteTaleId,
    );
    if (remote.encryption === "client") return;
    const base = {
      baseContentRev: remote.contentRev,
      baseMetadataRev: remote.metadataRev,
    };
    try {
      const { result } = await sendStoredWrite({
        ...input,
        writeKey,
        idempotencyKey: await createLinkedWriteIdempotencyKey(
          input.profile.id,
          input.profile.deviceId ?? "",
          writeKey,
          String(remote.contentRev),
          String(remote.metadataRev),
        ),
        method: "PUT",
        path,
        build: async () => {
          const cover = await migrateCover(input.transport, remote.cover);
          return {
            saveVersion: null,
            body: {
              encryptedPackage: await encryptSyncPackage(
                input.session,
                withCover(remote.package, cover),
                {
                  taleId: input.remoteTaleId,
                  contentRev: remote.contentRev + 1,
                  metadataRev: remote.metadataRev + 1,
                },
                cover,
              ),
              ...base,
              confirmReplace: true,
            },
          };
        },
      });
      await advance(base, result);
      return;
    } catch (error) {
      if (!isRevisionConflict(error)) throw error;
    }
  }
  throw new SyncHttpError(
    "This tale kept changing while it was encrypted.",
    409,
    "content_conflict",
  );
}

export async function migrateCloudSaves(input: {
  profile: SyncProfile;
  transport: SyncTransport;
  remoteTales: RemoteTale[];
}): Promise<CloudKeyInfo> {
  const session = input.transport.cloudEncryption;
  if (!session) throw cloudLockedError();
  let failure: unknown = null;
  for (const tale of input.remoteTales) {
    if (tale.encryption !== "server") continue;
    try {
      await migrateTale({ ...input, session, remoteTaleId: tale.id });
    } catch (error) {
      input.transport.signal?.throwIfAborted();
      failure ??= error;
    }
  }
  const info = await fetchCloudKey(input.transport);
  if (info.state === "migrating" && info.serverTaleCount === 0) {
    const done = await completeCloudMigration(
      input.transport,
      await cloudKeys.proof(session),
    );
    if (done.state === "client" && done.keyId === session.keyId) {
      await cloudKeys.markMigrated(session);
    }
    forgetCloudEncryptionStatus();
    return done;
  }
  if (failure) throw failure;
  return info;
}

export function countCloudOnlyTales(
  items: Array<{ source: "local" | "remote" }>,
) {
  return items.filter((item) => item.source === "remote").length;
}
