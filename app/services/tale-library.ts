import {
  deleteTaleSyncState,
  getSyncProfile,
  listTaleSyncStates,
  setTaleSyncPreference,
} from "@/repositories/sync.repository";
import {
  applyRemoteTalePackage,
  assertSyncAvailable,
  createSyncTransport,
  deleteRemoteTale,
  fetchSyncCapabilities,
  importRemoteTalePackage,
  keepBothTalePackage,
  listAllRemoteTales,
  replaceRemoteTalePackage,
  SyncHttpError,
} from "@/services/sync";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import { mergeTaleLibrary, type LibraryTaleItem } from "@/lib/tale-library";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import type { SyncMode, SyncProfile } from "@/types/sync.type";
import type { TaleHead } from "@/types/tale.type";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";

export type TaleConflictChoice = "keep-remote" | "keep-local" | "keep-both";

export interface SyncSettingsSnapshot {
  cloudBaseUrl: string;
  personalBaseUrl: string;
  activeSyncMode: SyncMode;
  accessToken: string;
  accessTokenExpiresAt: number | null;
  accountId: string;
  deviceId: string;
  hostedDeviceIdsByAccountId: Record<string, string>;
}

/** The sync profile the settings point at, how to reach it, and whether they let the app reach it. */
export interface SyncSession {
  profile: SyncProfile;
  accessToken?: string;
  canReach: boolean;
}

function syncProfileFrom(settings: SyncSettingsSnapshot): SyncProfile {
  const personal = settings.activeSyncMode === "personal";
  const accountId = settings.accountId;
  return {
    id: personal ? PERSONAL_PROFILE_ID : HOSTED_PROFILE_ID,
    baseUrl: personal
      ? settings.personalBaseUrl.trim()
      : settings.cloudBaseUrl.trim(),
    mode: settings.activeSyncMode,
    accountId: personal ? null : accountId || null,
    deviceId: personal
      ? null
      : accountId
        ? (
            settings.hostedDeviceIdsByAccountId[accountId] ?? settings.deviceId
          ).trim()
        : settings.deviceId.trim(),
  };
}

export function syncSessionFrom(settings: SyncSettingsSnapshot): SyncSession {
  const profile = syncProfileFrom(settings);
  const tokenExpired =
    settings.accessTokenExpiresAt !== null &&
    settings.accessTokenExpiresAt <= Date.now();
  const hostedTokenOk = settings.accessToken.trim().length > 0 && !tokenExpired;
  return {
    profile,
    accessToken:
      profile.mode === "hosted" ? settings.accessToken.trim() : undefined,
    canReach:
      profile.baseUrl.length > 0 &&
      (profile.mode === "personal" ||
        (hostedTokenOk && Boolean(profile.accountId))),
  };
}

export function currentSyncSession(): SyncSession {
  return syncSessionFrom(useSyncSettingsStore.getState());
}

export const syncTransport = (session: SyncSession) =>
  createSyncTransport({
    profile: session.profile,
    accessToken: session.accessToken,
  });

async function isSyncActive(session: SyncSession): Promise<boolean> {
  if (!session.canReach) return false;
  return Boolean((await getSyncProfile(session.profile.id))?.enabled);
}

function parseMetadataRev(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Synced tale is missing a valid metadata revision");
  }
  return parsed;
}

const isMissing = (error: unknown) =>
  error instanceof SyncHttpError && error.status === 404;

/** The library as the Tales page shows it. When the cloud can't be reached, only local tales, with the reason. */
export async function loadTaleLibrary(
  session: SyncSession,
  localTales: TaleHead[],
): Promise<{
  items: LibraryTaleItem[];
  syncActive: boolean;
  cloudError?: unknown;
}> {
  const local = () =>
    mergeTaleLibrary({
      localTales,
      remoteTales: [],
      syncStates: [],
      profileId: session.profile.id,
    });
  if (!(await isSyncActive(session)))
    return { items: local(), syncActive: false };
  const syncStates = await listTaleSyncStates(
    session.profile.id,
    session.profile.accountId,
  ).catch(() => []);
  try {
    const transport = syncTransport(session);
    assertSyncAvailable(await fetchSyncCapabilities(transport));
    const remoteTales = await listAllRemoteTales(transport, 50);
    return {
      items: mergeTaleLibrary({
        localTales,
        remoteTales,
        syncStates,
        profileId: session.profile.id,
      }),
      syncActive: true,
    };
  } catch (cloudError) {
    return {
      items: mergeTaleLibrary({
        localTales,
        remoteTales: [],
        syncStates,
        profileId: session.profile.id,
      }),
      syncActive: true,
      cloudError,
    };
  }
}

export function importCloudTale(
  session: SyncSession,
  remoteTaleId: string,
): Promise<string> {
  return importRemoteTalePackage({
    profile: session.profile,
    transport: syncTransport(session),
    remoteTaleId,
  });
}

export async function deleteLibraryTaleItem(
  item: LibraryTaleItem,
  options: {
    session: SyncSession;
    syncActive: boolean;
    deleteLocal: (taleId: string) => Promise<void>;
    onRemoteError?: (error: unknown) => void;
  },
) {
  const { session, syncActive, deleteLocal, onRemoteError } = options;
  if (item.source === "local") {
    if (item.sync && !syncActive) {
      const error = new Error(
        "Reconnect cloud sync before permanently deleting this synced tale.",
      );
      onRemoteError?.(error);
      throw error;
    }
    if (item.sync) {
      try {
        await deleteRemoteTale(
          syncTransport(session),
          item.sync.remoteTaleId,
          item.sync.remoteTale?.metadataRev ??
            parseMetadataRev(item.sync.metadataRev),
        );
      } catch (error) {
        if (!isMissing(error)) {
          onRemoteError?.(error);
          throw error;
        }
      }
    }
    await deleteLocal(item.localTale.id);
    return;
  }
  await deleteRemoteTale(
    syncTransport(session),
    item.remoteTale.id,
    item.remoteTale.metadataRev,
  );
}

/** Starts syncing a local tale. Returns false when there was nothing to do. */
export async function syncLibraryTaleItem(
  item: LibraryTaleItem,
  options: { session: SyncSession; syncActive: boolean },
): Promise<boolean> {
  if (!options.syncActive || item.source !== "local" || item.sync) return false;
  await setTaleSyncPreference({
    profileId: options.session.profile.id,
    accountId: options.session.profile.accountId,
    localTaleId: item.localTale.id,
    policy: "sync",
  });
  wakeSyncBackground();
  return true;
}

export async function removeLibraryTaleItemFromCloud(
  item: LibraryTaleItem,
  options: {
    session: SyncSession;
    syncActive: boolean;
    onRemoteError?: (error: unknown) => void;
  },
) {
  const { session, syncActive, onRemoteError } = options;
  if (!syncActive) throw new Error("Sync is not active");
  const { profile } = session;
  const transport = syncTransport(session);
  const localTaleId =
    item.source === "local"
      ? item.localTale.id
      : await importRemoteTalePackage({
          profile,
          transport,
          remoteTaleId: item.remoteTale.id,
        });
  const remoteTaleId =
    item.source === "local" ? item.sync?.remoteTaleId : item.remoteTale.id;
  if (!remoteTaleId) throw new Error("Tale is not synced");
  const metadataRev =
    item.source === "local"
      ? (item.sync?.remoteTale?.metadataRev ??
        parseMetadataRev(item.sync?.metadataRev ?? null))
      : item.remoteTale.metadataRev;

  try {
    await deleteRemoteTale(transport, remoteTaleId, metadataRev);
  } catch (error) {
    if (!isMissing(error)) {
      onRemoteError?.(error);
      throw error;
    }
  }

  await setTaleSyncPreference({
    profileId: profile.id,
    accountId: profile.accountId,
    localTaleId,
    policy: "private",
  });
  await deleteTaleSyncState({
    profileId: profile.id,
    accountId: profile.accountId,
    localTaleId,
  });
}

/** Settles a sync conflict. Returns the local tale that holds the result. */
export async function resolveTaleConflict(
  item: LibraryTaleItem,
  choice: TaleConflictChoice,
  session: SyncSession,
): Promise<string> {
  if (item.source !== "local" || item.sync?.status !== "conflict") {
    throw new Error("Tale does not have a sync conflict");
  }
  const { profile } = session;
  const transport = syncTransport(session);
  const idempotencyKey = `conflict-${item.localTale.id}-${Date.now()}`;

  if (choice === "keep-remote") {
    const applied = await applyRemoteTalePackage({
      profile,
      transport,
      localTaleId: item.localTale.id,
    });
    if (!applied) {
      throw new SyncHttpError(
        "The local tale changed while resolving the conflict. Review it and try again.",
        409,
        "local_changed",
      );
    }
    return item.localTale.id;
  }
  if (choice === "keep-local") {
    await replaceRemoteTalePackage({
      profile,
      transport,
      localTaleId: item.localTale.id,
      idempotencyKey,
      forceReplace: true,
      existingCover: item.sync.remoteTale?.cover,
    });
    return item.localTale.id;
  }
  return keepBothTalePackage({
    profile,
    transport,
    localTaleId: item.localTale.id,
    idempotencyKey,
  });
}
