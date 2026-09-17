import { invoke } from "@tauri-apps/api/core";

const SYNC_SETTINGS_KEY = "sync-settings";
const pendingSecretOperations = new Map<string, Promise<unknown>>();

function withSecretStore<T>(
  profileId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = pendingSecretOperations.get(profileId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingSecretOperations.set(profileId, next);
  void next
    .finally(() => {
      if (pendingSecretOperations.get(profileId) === next)
        pendingSecretOperations.delete(profileId);
    })
    .catch(() => undefined);
  return next;
}

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
  await withSecretStore(profileId, () =>
    invoke("set_hosted_refresh_token", { profileId, token }),
  );
}

export async function getHostedRefreshToken(
  profileId: string,
): Promise<string | null> {
  return await withSecretStore(profileId, () =>
    invoke<string | null>("get_hosted_refresh_token", {
      profileId,
    }),
  );
}

export async function deleteHostedRefreshToken(
  profileId: string,
): Promise<void> {
  await withSecretStore(profileId, () =>
    invoke("delete_hosted_refresh_token", { profileId }),
  );
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
    // A sign-out or settings write while the keyring was pending must win.
    // Zustand already excludes legacy plaintext from every new persisted state.
    if (globalThis.localStorage?.getItem(SYNC_SETTINGS_KEY) === raw) {
      globalThis.localStorage?.setItem(SYNC_SETTINGS_KEY, JSON.stringify(next));
    }
  }

  return migrated;
}
