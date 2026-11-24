import type { CoverAssetReference } from "./catalog.type";

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

export type RemoteTaleCover = Pick<
  CoverAssetReference,
  "assetId" | "contentType" | "byteSize" | "sha256"
>;

export type RemoteTale = {
  id: string;
  sourceTaleId: string;
  encryption?: "server" | "client";
  locked?: boolean;
  title: string;
  description: string | null;
  gameMode: string;
  coverAssetId: string | null;
  thumbnailAssetId: string | null;
  cover?: RemoteTaleCover | null;
  contentRev: number;
  metadataRev: number;
  turnCount: number;
  entryCount?: number;
  storageBytes?: number;
  updatedAt: string;
  lastEntryPreview: string | null;
};

export type TaleSyncStatus = "idle" | "push" | "pull" | "conflict" | "error";

export type TaleSyncState = {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
  remoteTaleId: string;
  contentRev: string | null;
  metadataRev: string | null;
  lastSyncedAt: number | null;
  pendingStatus: TaleSyncStatus;
  lastErrorCode: string | null;
};
