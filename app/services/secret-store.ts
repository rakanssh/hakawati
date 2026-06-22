import { invoke } from "@tauri-apps/api/core";

const SYNC_SETTINGS_KEY = "sync-settings";

type PersistedSyncSettings = {
  state?: {
    refreshToken?: unknown;
    hasRefreshToken?: boolean;
  };
  version?: number;
};

export async function setHostedRefreshToken(
  profileId: string,
  token: string,
): Promise<void> {
  await invoke("set_hosted_refresh_token", { profileId, token });
}

export async function getHostedRefreshToken(
  profileId: string,
): Promise<string | null> {
  return await invoke<string | null>("get_hosted_refresh_token", {
    profileId,
  });
}

export async function deleteHostedRefreshToken(
  profileId: string,
): Promise<void> {
  await invoke("delete_hosted_refresh_token", { profileId });
}

export async function migrateStoredHostedRefreshToken(
  profileId: string,
): Promise<boolean> {
  const raw = globalThis.localStorage?.getItem(SYNC_SETTINGS_KEY);
  if (!raw) return false;

  let parsed: PersistedSyncSettings;
  try {
    parsed = JSON.parse(raw) as PersistedSyncSettings;
  } catch {
    return false;
  }

  const token =
    typeof parsed.state?.refreshToken === "string"
      ? parsed.state.refreshToken.trim()
      : "";
  if (!token) return Boolean(parsed.state?.hasRefreshToken);

  let migrated = false;
  try {
    await setHostedRefreshToken(profileId, token);
    migrated = true;
  } finally {
    const next = {
      ...parsed,
      state: {
        ...parsed.state,
        hasRefreshToken: migrated,
      },
    };
    delete next.state.refreshToken;
    globalThis.localStorage?.setItem(SYNC_SETTINGS_KEY, JSON.stringify(next));
  }

  return migrated;
}
