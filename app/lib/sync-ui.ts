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
