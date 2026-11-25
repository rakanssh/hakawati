import { invoke } from "@tauri-apps/api/core";

export const CLOUD_ENCRYPTION_SCHEME = "client-v1";

export type CloudEnvelope = {
  v: 1;
  scheme: typeof CLOUD_ENCRYPTION_SCHEME;
  alg: "aes-256-gcm";
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export type CloudPairingPayload = {
  v: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export type CloudKeyScope = { serverOrigin: string; accountId: string };

export type CloudEncryptionContext = CloudKeyScope & { keyId: string };

export type LocalCloudKey = {
  keyId: string | null;
  hasKey: boolean;
  pendingKeyId: string | null;
  migrated: boolean;
};

export type CloudKeySetup = {
  keyId: string;
  keyCheck: string;
  recoveryWrappedKey: CloudEnvelope;
  recoveryKey: string;
};

export type CloudRecoveryReplacement = {
  keyProof: string;
  recoveryWrappedKey: CloudEnvelope;
  recoveryKey: string;
};

export type TaleRevision = {
  taleId: string;
  contentRev: number;
  metadataRev: number;
};

export type PairingDirection = "send" | "receive";

export type ScannedPairing = {
  pairingId: string;
  direction: PairingDirection;
  scannerPublicKey: string;
  scannerConfirm: string;
  code: string;
};

function keyArgs(context: CloudEncryptionContext) {
  return {
    scope: { serverOrigin: context.serverOrigin, accountId: context.accountId },
    keyId: context.keyId,
  };
}

export const cloudKeys = {
  local: (scope: CloudKeyScope) =>
    invoke<LocalCloudKey>("cloud_key_local", { scope }),
  beginSetup: (scope: CloudKeyScope) =>
    invoke<CloudKeySetup>("cloud_key_begin_setup", { scope }),
  adopt: (scope: CloudKeyScope, keyId: string, keyCheck: string) =>
    invoke<boolean>("cloud_key_adopt", { scope, keyId, keyCheck }),
  discardPending: (scope: CloudKeyScope) =>
    invoke<void>("cloud_key_discard_pending", { scope }),
  forget: (scope: CloudKeyScope) => invoke<void>("cloud_key_forget", { scope }),
  markMigrated: (context: CloudEncryptionContext) =>
    invoke<void>("cloud_key_mark_migrated", keyArgs(context)),
  proof: (context: CloudEncryptionContext) =>
    invoke<string>("cloud_key_proof", keyArgs(context)),
  newRecovery: (context: CloudEncryptionContext) =>
    invoke<CloudRecoveryReplacement>(
      "cloud_key_new_recovery",
      keyArgs(context),
    ),
  recover: (
    scope: CloudKeyScope,
    input: {
      keyId: string;
      keyCheck: string;
      recoveryWrappedKey: CloudEnvelope;
      recoveryKey: string;
    },
  ) => invoke<void>("cloud_key_recover", { scope, ...input }),
  encryptTale: (
    context: CloudEncryptionContext,
    revision: TaleRevision,
    summary: string,
    pkg: string,
  ) =>
    invoke<{ summary: CloudEnvelope; package: CloudEnvelope }>(
      "cloud_tale_encrypt",
      { ...keyArgs(context), revision, summary, package: pkg },
    ),
  decryptTale: (
    context: CloudEncryptionContext,
    revision: TaleRevision,
    summary: CloudEnvelope,
    pkg: CloudEnvelope,
  ) =>
    invoke<{ summary: string; package: string }>("cloud_tale_decrypt", {
      ...keyArgs(context),
      revision,
      summary,
      package: pkg,
    }),
  decryptSummaries: (
    context: CloudEncryptionContext,
    items: Array<TaleRevision & { summary: CloudEnvelope }>,
  ) =>
    invoke<Array<string | null>>("cloud_summaries_decrypt", {
      ...keyArgs(context),
      items,
    }),
  encryptCover: (
    context: CloudEncryptionContext,
    assetId: string,
    imageBase64: string,
  ) =>
    invoke<string>("cloud_cover_encrypt", {
      ...keyArgs(context),
      assetId,
      imageBase64,
    }),
  decryptCover: (
    context: CloudEncryptionContext,
    assetId: string,
    objectBase64: string,
  ) =>
    invoke<string>("cloud_cover_decrypt", {
      ...keyArgs(context),
      assetId,
      objectBase64,
    }),
  showPairing: (
    scope: CloudKeyScope,
    pairingId: string,
    direction: PairingDirection,
  ) => invoke<string>("cloud_pairing_show", { scope, pairingId, direction }),
  scanPairing: (scope: CloudKeyScope, code: string) =>
    invoke<ScannedPairing>("cloud_pairing_scan", { scope, code }),
  confirmPairing: (
    pairingId: string,
    scannerPublicKey: string,
    scannerConfirm: string,
  ) =>
    invoke<string>("cloud_pairing_confirm", {
      pairingId,
      scannerPublicKey,
      scannerConfirm,
    }),
  sealPairing: (pairingId: string, keyId: string) =>
    invoke<CloudPairingPayload>("cloud_pairing_seal", { pairingId, keyId }),
  openPairing: (
    pairingId: string,
    keyId: string,
    keyCheck: string,
    payload: CloudPairingPayload,
  ) =>
    invoke<void>("cloud_pairing_open", {
      pairingId,
      keyId,
      keyCheck,
      payload,
    }),
  endPairing: (pairingId: string) =>
    invoke<void>("cloud_pairing_end", { pairingId }),
};

export function cloudKeyError(error: unknown): string | null {
  return typeof error === "string" && /^[a-z_]+$/.test(error) ? error : null;
}
