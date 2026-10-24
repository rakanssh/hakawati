import type { LibraryTaleItem } from "@/lib/tale-library";

export type SyncUiKind =
  | "local"
  | "personal"
  | "signed-in"
  | "profile-incomplete"
  | "reconnecting"
  | "sign-in-required"
  | "sync-off"
  | "device-limit";

export function getSyncUiKind(input: {
  activeSyncMode: "hosted" | "personal";
  personalBaseUrl: string;
  accessToken: string;
  accessTokenExpiresAt: number | null;
  hasRefreshToken: boolean;
  accountLabel: string;
  syncEnabled?: boolean;
  disabledReason?: string | null;
  refreshFailed?: boolean;
  now?: number;
}): SyncUiKind {
  if (input.activeSyncMode === "personal" && input.personalBaseUrl.trim()) {
    return "personal";
  }
  if (input.disabledReason === "device_limit") return "device-limit";

  const tokenExpired =
    input.accessTokenExpiresAt !== null &&
    input.accessTokenExpiresAt <= (input.now ?? Date.now());
  const hasToken = input.accessToken.trim().length > 0;
  const hasAccount = input.accountLabel.trim().length > 0;

  if (hasToken && !tokenExpired) {
    if (
      input.syncEnabled === false ||
      input.disabledReason === "user_disabled"
    ) {
      return "sync-off";
    }
    return hasAccount ? "signed-in" : "profile-incomplete";
  }
  if (
    input.hasRefreshToken &&
    !input.refreshFailed &&
    input.disabledReason !== "signed_out" &&
    input.disabledReason !== "user_disabled"
  ) {
    return "reconnecting";
  }

  return hasAccount || hasToken || input.hasRefreshToken
    ? "sign-in-required"
    : "local";
}

const REFUSED_SYNC_ERROR_CODES = new Set([
  "quota_exceeded",
  "package_too_large",
  "400",
  "413",
]);

export function isRefusedSyncError(code: string | null | undefined) {
  return typeof code === "string" && REFUSED_SYNC_ERROR_CODES.has(code);
}

export type TaleSyncBadge =
  | "local"
  | "cloud"
  | "conflict"
  | "cloud-full"
  | "not-synced";

export function getTaleSyncBadge(item: LibraryTaleItem): TaleSyncBadge {
  if (item.source === "remote") return "cloud";
  if (!item.sync) return "local";
  if (item.sync.status === "conflict") return "conflict";
  if (
    item.sync.status === "error" &&
    isRefusedSyncError(item.sync.lastErrorCode)
  ) {
    return item.sync.lastErrorCode === "quota_exceeded"
      ? "cloud-full"
      : "not-synced";
  }
  return "cloud";
}
