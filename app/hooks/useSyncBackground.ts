import { useEffect, useMemo, useRef } from "react";
import { i18n } from "@lingui/core";
import { toast } from "sonner";
import { createUploadIdempotencyKey } from "@/lib/sync-idempotency";
import {
  deleteTaleSyncState,
  getSyncProfile,
  listTaleSyncPreferences,
  listTaleSyncStates,
  setSyncProfileDisabled,
  setTaleSyncPreference,
  upsertTaleSyncState,
} from "@/repositories/sync.repository";
import {
  assertSyncAvailable,
  createSyncTransport,
  fetchSyncCapabilities,
  listAllRemoteTales,
  listHostedDevices,
  syncLinkedTale,
  uploadTalePackage,
  type SyncProfile,
} from "@/services/sync";
import { addSyncWakeListener, notifySyncChanged } from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";
const SYNC_INTERVAL_MS = 60_000;

export function useSyncBackground(dbReady: boolean) {
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
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const latestRunRef = useRef<(() => Promise<void>) | null>(null);
  const notifiedUploadOperationKeysRef = useRef(new Set<string>());

  const profile = useMemo<SyncProfile>(
    () => ({
      id:
        activeSyncMode === "personal" ? PERSONAL_PROFILE_ID : HOSTED_PROFILE_ID,
      baseUrl:
        activeSyncMode === "personal"
          ? personalBaseUrl.trim()
          : cloudBaseUrl.trim(),
      mode: activeSyncMode,
      accountId: activeSyncMode === "hosted" ? accountId || null : null,
      deviceId:
        activeSyncMode === "hosted"
          ? accountId
            ? (hostedDeviceIdsByAccountId[accountId] ?? deviceId).trim()
            : deviceId.trim()
          : null,
    }),
    [
      accountId,
      activeSyncMode,
      cloudBaseUrl,
      deviceId,
      hostedDeviceIdsByAccountId,
      personalBaseUrl,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function runSyncOnce() {
      if (signal.aborted) return;
      if (runningRef.current) {
        rerunRef.current = true;
        return;
      }
      if (!dbReady || profile.baseUrl.length === 0) return;
      const tokenExpired =
        accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
      if (
        profile.mode === "hosted" &&
        (accessToken.trim().length === 0 || tokenExpired)
      ) {
        return;
      }

      runningRef.current = true;
      try {
        const storedProfile = await getSyncProfile(profile.id);
        if (signal.aborted) return;
        if (!storedProfile?.enabled) return;
        const activeProfile = {
          ...profile,
          enabled: storedProfile.enabled,
          disabledReason: storedProfile.disabledReason ?? null,
        };
        const transport = createSyncTransport({
          profile: activeProfile,
          signal,
          accessToken:
            activeProfile.mode === "hosted" ? accessToken.trim() : undefined,
        });
        const capabilities = await fetchSyncCapabilities(transport);
        if (signal.aborted) return;
        assertSyncAvailable(capabilities);
        if (activeProfile.mode === "hosted") {
          if (!activeProfile.accountId) return;
          const devices = await listHostedDevices(transport);
          if (signal.aborted) return;
          if (!devices.some((device) => device.id === activeProfile.deviceId)) {
            await setSyncProfileDisabled(activeProfile.id, "device_limit");
            return;
          }
        }
        const [remoteTales, syncStates, syncPreferences] = await Promise.all([
          listAllRemoteTales(transport),
          listTaleSyncStates(activeProfile.id, activeProfile.accountId),
          listTaleSyncPreferences(activeProfile.id, activeProfile.accountId),
        ]);
        if (signal.aborted) return;
        const remoteById = new Map(remoteTales.map((tale) => [tale.id, tale]));
        const remoteBySourceId = new Map(
          remoteTales.map((tale) => [tale.sourceTaleId, tale]),
        );
        const stateByLocalId = new Map(
          syncStates.map((state) => [state.localTaleId, state]),
        );

        for (const preference of syncPreferences) {
          if (signal.aborted) return;
          if (preference.policy !== "sync") continue;
          let state = stateByLocalId.get(preference.localTaleId);
          const recoverableRemote = remoteBySourceId.get(
            preference.localTaleId,
          );
          if (!state && recoverableRemote) {
            state = {
              profileId: activeProfile.id,
              accountId: activeProfile.accountId,
              localTaleId: preference.localTaleId,
              remoteTaleId: recoverableRemote.id,
              // The response was lost, so these revisions were never acknowledged.
              // Reconcile package contents before adopting any later remote edits.
              contentRev: null,
              metadataRev: null,
              lastSyncedAt: null,
              pendingStatus: "error",
              lastErrorCode: "sync_failed",
            };
            await upsertTaleSyncState(state);
            if (signal.aborted) return;
            syncStates.push(state);
            stateByLocalId.set(state.localTaleId, state);
          }
          const hasRemoteLink = state
            ? remoteById.has(state.remoteTaleId)
            : false;
          if (hasRemoteLink) continue;
          if (state) {
            await setTaleSyncPreference({
              profileId: activeProfile.id,
              accountId: activeProfile.accountId,
              localTaleId: state.localTaleId,
              policy: "private",
            });
            if (signal.aborted) return;
            await deleteTaleSyncState({
              profileId: activeProfile.id,
              accountId: activeProfile.accountId,
              localTaleId: state.localTaleId,
            });
            continue;
          }
          const idempotencyKey = await createUploadIdempotencyKey(
            activeProfile.id,
            activeProfile.accountId ?? "personal",
            preference.localTaleId,
            preference.updatedAt,
          );
          if (signal.aborted) return;
          try {
            await uploadTalePackage({
              profile: activeProfile,
              transport,
              localTaleId: preference.localTaleId,
              idempotencyKey,
              capabilities,
            });
          } catch (error) {
            if (signal.aborted) return;
            console.warn("Background tale upload failed", error);
            if (!notifiedUploadOperationKeysRef.current.has(idempotencyKey)) {
              notifiedUploadOperationKeysRef.current.add(idempotencyKey);
              toast.error(i18n._("Failed to upload tale to cloud"));
            }
          }
        }

        for (const state of syncStates) {
          if (signal.aborted) return;
          const remoteTale = remoteById.get(state.remoteTaleId);
          if (!remoteTale) continue;
          try {
            await syncLinkedTale({
              profile: activeProfile,
              transport,
              localTaleId: state.localTaleId,
              remoteTale,
              idempotencyKey: `sync-${activeProfile.id}-${state.localTaleId}-${state.contentRev ?? "0"}-${state.metadataRev ?? "0"}`,
              capabilities,
              canPull: () => {
                const active = useTaleStore.getState();
                return (
                  active.id !== state.localTaleId &&
                  active.loadingTaleId !== state.localTaleId
                );
              },
            });
          } catch (error) {
            if (signal.aborted) return;
            console.warn("Background sync failed", error);
          }
        }
      } catch (error) {
        if (!signal.aborted)
          console.warn("Background sync refresh failed", error);
      } finally {
        if (!signal.aborted) notifySyncChanged();
        runningRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          void latestRunRef.current?.();
        }
      }
    }
    latestRunRef.current = runSyncOnce;
    void runSyncOnce();
    const removeWakeListener = addSyncWakeListener(() => {
      void runSyncOnce();
    });
    const intervalId = window.setInterval(() => {
      void runSyncOnce();
    }, SYNC_INTERVAL_MS);
    return () => {
      controller.abort();
      latestRunRef.current = null;
      removeWakeListener();
      window.clearInterval(intervalId);
    };
  }, [accessToken, accessTokenExpiresAt, dbReady, profile]);
}
