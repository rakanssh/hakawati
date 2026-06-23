import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoadTale } from "@/hooks/useGameSaves";
import { useTalesList } from "@/hooks/useTales";
import {
  deleteTaleSyncState,
  getSyncProfile,
  listTaleSyncStates,
  setTaleSyncPreference,
  type TaleSyncState,
} from "@/repositories/sync.repository";
import {
  applyRemoteTalePackage,
  createSyncTransport,
  deleteRemoteTale,
  importRemoteTalePackage,
  keepBothTalePackage,
  listAllRemoteTales,
  replaceRemoteTalePackage,
  SyncHttpError,
  type RemoteTale,
  type SyncProfile,
} from "@/services/sync";
import {
  addSyncChangedListener,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { mergeTaleLibrary, type LibraryTaleItem } from "@/lib/tale-library";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";

export type TaleConflictChoice = "keep-remote" | "keep-local" | "keep-both";

function parseMetadataRev(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Synced tale is missing a valid metadata revision");
  }
  return parsed;
}

export function useTaleLibrary(initialPage = 1, initialLimit = 12) {
  const local = useTalesList(initialPage, initialLimit);
  const { load } = useLoadTale();
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const personalBaseUrl = useSyncSettingsStore(
    (state) => state.personalBaseUrl,
  );
  const activeSyncMode = useSyncSettingsStore((state) => state.activeSyncMode);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const [remoteTales, setRemoteTales] = useState<RemoteTale[]>([]);
  const [syncStates, setSyncStates] = useState<TaleSyncState[]>([]);
  const [syncStatesHydrated, setSyncStatesHydrated] = useState(false);
  const [syncListReady, setSyncListReady] = useState(false);
  const [syncActive, setSyncActive] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<unknown>(null);

  const profile = useMemo<SyncProfile>(
    () => ({
      id:
        activeSyncMode === "personal" ? PERSONAL_PROFILE_ID : HOSTED_PROFILE_ID,
      baseUrl:
        activeSyncMode === "personal"
          ? personalBaseUrl.trim()
          : cloudBaseUrl.trim(),
      mode: activeSyncMode,
      deviceId: activeSyncMode === "hosted" ? deviceId.trim() : null,
    }),
    [activeSyncMode, cloudBaseUrl, deviceId, personalBaseUrl],
  );
  const tokenExpired =
    accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
  const hostedTokenOk = accessToken.trim().length > 0 && !tokenExpired;
  const canReachProfile =
    profile.baseUrl.length > 0 &&
    (profile.mode === "personal" || hostedTokenOk);

  const refreshRemote = useCallback(async () => {
    setSyncListReady(!canReachProfile);
    setSyncStatesHydrated(false);
    if (!canReachProfile) {
      setSyncActive(false);
      setRemoteTales([]);
      setSyncStates([]);
      setSyncStatesHydrated(true);
      setSyncListReady(true);
      setRemoteError(null);
      return;
    }

    setRemoteLoading(true);
    setRemoteError(null);
    let profileEnabled = false;
    try {
      const storedProfile = await getSyncProfile(profile.id);
      if (!storedProfile?.enabled) {
        setSyncActive(false);
        setRemoteTales([]);
        setSyncStates([]);
        setSyncStatesHydrated(true);
        setSyncListReady(true);
        return;
      }
      profileEnabled = true;
      setSyncActive(true);
      try {
        setSyncStates(await listTaleSyncStates(profile.id));
      } catch {
        setSyncStates([]);
      } finally {
        setSyncStatesHydrated(true);
      }
      setRemoteTales(
        await listAllRemoteTales(
          createSyncTransport({
            profile,
            accessToken:
              profile.mode === "hosted" ? accessToken.trim() : undefined,
          }),
          local.limit,
        ),
      );
    } catch (error) {
      if (!profileEnabled) {
        setSyncActive(false);
        setSyncStates([]);
      }
      setRemoteError(error);
      setRemoteTales([]);
      setSyncStatesHydrated(true);
    } finally {
      setSyncListReady(true);
      setRemoteLoading(false);
    }
  }, [accessToken, canReachProfile, local.limit, profile]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  useEffect(
    () =>
      addSyncChangedListener(() => {
        void local.refresh();
        void refreshRemote();
      }),
    [local, refreshRemote],
  );

  const syncListLoading = canReachProfile && !syncListReady;

  const items = useMemo(
    () =>
      mergeTaleLibrary({
        localTales: local.items,
        remoteTales,
        syncStates,
        profileId: profile.id,
      }),
    [local.items, profile.id, remoteTales, syncStates],
  );

  const refresh = useCallback(async () => {
    await Promise.all([local.refresh(), refreshRemote()]);
  }, [local, refreshRemote]);

  const loadIntoGame = useCallback(
    async (item: LibraryTaleItem) => {
      if (item.source === "local") {
        await local.loadIntoGame(item.localTale.id);
        return item.localTale.id;
      }
      const localTaleId = await importRemoteTalePackage({
        profile,
        transport: createSyncTransport({
          profile,
          accessToken:
            profile.mode === "hosted" ? accessToken.trim() : undefined,
        }),
        remoteTaleId: item.remoteTale.id,
      });
      await load(localTaleId);
      await refresh();
      return localTaleId;
    },
    [accessToken, load, local, profile, refresh],
  );

  const deleteLibraryTale = useCallback(
    async (item: LibraryTaleItem) => {
      const transport = createSyncTransport({
        profile,
        accessToken: profile.mode === "hosted" ? accessToken.trim() : undefined,
      });
      if (item.source === "local") {
        if (item.sync && syncActive) {
          try {
            await deleteRemoteTale(
              transport,
              item.sync.remoteTaleId,
              item.sync.remoteTale?.metadataRev ??
                parseMetadataRev(item.sync.metadataRev),
            );
          } catch (error) {
            setRemoteError(error);
          }
        }
        await local.deleteTale(item.localTale.id);
        await refresh();
        return;
      }
      await deleteRemoteTale(
        transport,
        item.remoteTale.id,
        item.remoteTale.metadataRev,
      );
      await refresh();
    },
    [accessToken, local, profile, refresh, syncActive],
  );

  const syncLibraryTale = useCallback(
    async (item: LibraryTaleItem) => {
      if (!syncActive || item.source !== "local" || item.sync) return;
      await setTaleSyncPreference({
        profileId: profile.id,
        localTaleId: item.localTale.id,
        policy: "sync",
      });
      wakeSyncBackground();
      await refresh();
    },
    [profile.id, refresh, syncActive],
  );

  const removeLibraryTaleFromCloud = useCallback(
    async (item: LibraryTaleItem) => {
      if (!syncActive) throw new Error("Sync is not active");
      const transport = createSyncTransport({
        profile,
        accessToken: profile.mode === "hosted" ? accessToken.trim() : undefined,
      });
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
        if (!(error instanceof SyncHttpError && error.status === 404)) {
          setRemoteError(error);
          throw error;
        }
      }

      await deleteTaleSyncState({ profileId: profile.id, localTaleId });
      await setTaleSyncPreference({
        profileId: profile.id,
        localTaleId,
        policy: "private",
      });
      await refresh();
    },
    [accessToken, profile, refresh, syncActive],
  );

  const resolveConflict = useCallback(
    async (item: LibraryTaleItem, choice: TaleConflictChoice) => {
      if (item.source !== "local" || item.sync?.status !== "conflict") {
        throw new Error("Tale does not have a sync conflict");
      }
      const transport = createSyncTransport({
        profile,
        accessToken: profile.mode === "hosted" ? accessToken.trim() : undefined,
      });
      const idempotencyKey = `conflict-${item.localTale.id}-${Date.now()}`;

      let resolvedLocalTaleId = item.localTale.id;
      if (choice === "keep-remote") {
        await applyRemoteTalePackage({
          profile,
          transport,
          localTaleId: item.localTale.id,
        });
      } else if (choice === "keep-local") {
        await replaceRemoteTalePackage({
          profile,
          transport,
          localTaleId: item.localTale.id,
          idempotencyKey,
          forceReplace: true,
        });
      } else {
        resolvedLocalTaleId = await keepBothTalePackage({
          profile,
          transport,
          localTaleId: item.localTale.id,
          idempotencyKey,
        });
      }

      await refresh();
      return resolvedLocalTaleId;
    },
    [accessToken, profile, refresh],
  );

  return {
    ...local,
    loading: local.loading,
    items,
    remoteLoading,
    syncListLoading,
    syncActive,
    syncStatesLoading: !syncStatesHydrated,
    remoteError,
    refresh,
    loadIntoGame,
    deleteLibraryTale,
    syncLibraryTale,
    removeLibraryTaleFromCloud,
    resolveConflict,
  } as const;
}
