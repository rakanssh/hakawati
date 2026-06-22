import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoadTale } from "@/hooks/useGameSaves";
import { useTalesList } from "@/hooks/useTales";
import {
  getSyncProfile,
  listTaleSyncStates,
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
  type RemoteTale,
  type SyncProfile,
} from "@/services/sync";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { mergeTaleLibrary, type LibraryTaleItem } from "@/lib/tale-library";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";

export type TaleConflictChoice = "keep-remote" | "keep-local" | "keep-both";

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
    if (!canReachProfile) {
      setRemoteTales([]);
      setSyncStates([]);
      setRemoteError(null);
      return;
    }
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const storedProfile = await getSyncProfile(profile.id);
      if (!storedProfile?.enabled) {
        setRemoteTales([]);
        setSyncStates([]);
        return;
      }
      const [nextRemoteTales, states] = await Promise.all([
        listAllRemoteTales(
          createSyncTransport({
            profile,
            accessToken:
              profile.mode === "hosted" ? accessToken.trim() : undefined,
          }),
          local.limit,
        ),
        listTaleSyncStates(profile.id),
      ]);
      setRemoteTales(nextRemoteTales);
      setSyncStates(states);
    } catch (error) {
      setRemoteError(error);
      setRemoteTales([]);
    } finally {
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
      if (item.source === "local") {
        await local.deleteTale(item.localTale.id);
        return;
      }
      await deleteRemoteTale(
        createSyncTransport({
          profile,
          accessToken:
            profile.mode === "hosted" ? accessToken.trim() : undefined,
        }),
        item.remoteTale.id,
      );
      await refresh();
    },
    [accessToken, local, profile, refresh],
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
    items,
    remoteLoading,
    remoteError,
    refresh,
    loadIntoGame,
    deleteLibraryTale,
    resolveConflict,
  } as const;
}
