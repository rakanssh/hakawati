import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoadTale } from "@/hooks/useGameSaves";
import { useTalesList } from "@/hooks/useTales";
import {
  getSyncProfile,
  listTaleSyncStates,
} from "@/repositories/sync.repository";
import {
  assertSyncAvailable,
  fetchSyncCapabilities,
  listAllRemoteTales,
} from "@/services/sync";
import type { RemoteTale, TaleSyncState } from "@/types/sync.type";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import {
  deleteLibraryTaleItem,
  importCloudTale,
  removeLibraryTaleItemFromCloud,
  resolveTaleConflict,
  syncLibraryTaleItem,
  syncSessionFrom,
  syncTransport,
  type TaleConflictChoice,
} from "@/services/tale-library.service";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { mergeTaleLibrary, type LibraryTaleItem } from "@/lib/tale-library";

export type { TaleConflictChoice };

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
  const accountId = useSyncSettingsStore((state) => state.accountId);
  const hostedDeviceIdsByAccountId = useSyncSettingsStore(
    (state) => state.hostedDeviceIdsByAccountId,
  );
  const [remoteTales, setRemoteTales] = useState<RemoteTale[]>([]);
  const [syncStates, setSyncStates] = useState<TaleSyncState[]>([]);
  const [syncStatesHydrated, setSyncStatesHydrated] = useState(false);
  const [syncListReady, setSyncListReady] = useState(false);
  const [syncActive, setSyncActive] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<unknown>(null);

  const tokenExpired =
    accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
  const session = useMemo(
    () =>
      syncSessionFrom({
        accountId,
        activeSyncMode,
        cloudBaseUrl,
        deviceId,
        hostedDeviceIdsByAccountId,
        personalBaseUrl,
        accessToken,
        accessTokenExpiresAt: tokenExpired ? 0 : null,
      }),
    [
      accessToken,
      tokenExpired,
      accountId,
      activeSyncMode,
      cloudBaseUrl,
      deviceId,
      hostedDeviceIdsByAccountId,
      personalBaseUrl,
    ],
  );
  const { profile, canReach: canReachProfile } = session;
  const refreshGenerationRef = useRef(0);

  const refreshRemote = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    const isCurrent = () => generation === refreshGenerationRef.current;
    setSyncListReady(!canReachProfile);
    setSyncStatesHydrated(false);
    if (!canReachProfile) {
      setRemoteLoading(false);
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
      if (!isCurrent()) return;
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
        const states = await listTaleSyncStates(profile.id, profile.accountId);
        if (!isCurrent()) return;
        setSyncStates(states);
      } catch {
        if (isCurrent()) setSyncStates([]);
      } finally {
        if (isCurrent()) setSyncStatesHydrated(true);
      }
      const transport = syncTransport(session);
      const capabilities = await fetchSyncCapabilities(transport);
      assertSyncAvailable(capabilities);
      const tales = await listAllRemoteTales(transport, local.limit);
      if (!isCurrent()) return;
      setRemoteTales(tales);
    } catch (error) {
      if (!isCurrent()) return;
      if (!profileEnabled) {
        setSyncActive(false);
        setSyncStates([]);
      }
      setRemoteError(error);
      setRemoteTales([]);
      setSyncStatesHydrated(true);
    } finally {
      if (isCurrent()) {
        setSyncListReady(true);
        setRemoteLoading(false);
      }
    }
  }, [canReachProfile, local.limit, profile, session]);

  useEffect(() => {
    void refreshRemote();
    return () => {
      refreshGenerationRef.current += 1;
    };
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
      const localTaleId = await importCloudTale(session, item.remoteTale.id);
      await load(localTaleId);
      await refresh();
      return localTaleId;
    },
    [load, local, refresh, session],
  );

  const deleteLibraryTale = useCallback(
    async (item: LibraryTaleItem) => {
      await deleteLibraryTaleItem(item, {
        session,
        syncActive,
        deleteLocal: local.deleteTale,
        onRemoteError: setRemoteError,
      });
      await refresh();
    },
    [local, refresh, session, syncActive],
  );

  const syncLibraryTale = useCallback(
    async (item: LibraryTaleItem) => {
      if (await syncLibraryTaleItem(item, { session, syncActive }))
        await refresh();
    },
    [refresh, session, syncActive],
  );

  const removeLibraryTaleFromCloud = useCallback(
    async (item: LibraryTaleItem) => {
      await removeLibraryTaleItemFromCloud(item, {
        session,
        syncActive,
        onRemoteError: setRemoteError,
      });
      await refresh();
    },
    [refresh, session, syncActive],
  );

  const resolveConflict = useCallback(
    async (item: LibraryTaleItem, choice: TaleConflictChoice) => {
      const resolved = await resolveTaleConflict(item, choice, session);
      await refresh();
      return resolved;
    },
    [refresh, session],
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
