import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getSyncProfile,
  listTaleSyncPreferences,
  listTaleSyncStates,
  setSyncProfileDisabled,
} from "@/repositories/sync.repository";
import {
  createSyncTransport,
  listAllRemoteTales,
  listHostedDevices,
  syncLinkedTale,
  uploadTalePackage,
  type SyncProfile,
} from "@/services/sync";
import { addSyncWakeListener, notifySyncChanged } from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

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

  const profile = useMemo<SyncProfile>(
    () => ({
      id:
        activeSyncMode === "personal" ? PERSONAL_PROFILE_ID : HOSTED_PROFILE_ID,
      baseUrl:
        activeSyncMode === "personal"
          ? personalBaseUrl.trim()
          : cloudBaseUrl.trim(),
      mode: activeSyncMode,
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

  const syncOnce = useCallback(
    async function runSyncOnce() {
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
        if (!storedProfile?.enabled) return;
        const activeProfile = {
          ...profile,
          enabled: storedProfile.enabled,
          disabledReason: storedProfile.disabledReason ?? null,
        };
        const transport = createSyncTransport({
          profile: activeProfile,
          accessToken:
            activeProfile.mode === "hosted" ? accessToken.trim() : undefined,
        });
        if (activeProfile.mode === "hosted") {
          const devices = await listHostedDevices(transport);
          if (!devices.some((device) => device.id === activeProfile.deviceId)) {
            await setSyncProfileDisabled(activeProfile.id, "device_limit");
            return;
          }
        }
        const [remoteTales, syncStates, syncPreferences] = await Promise.all([
          listAllRemoteTales(transport),
          listTaleSyncStates(activeProfile.id),
          listTaleSyncPreferences(activeProfile.id),
        ]);
        const remoteById = new Map(remoteTales.map((tale) => [tale.id, tale]));
        const stateByLocalId = new Map(
          syncStates.map((state) => [state.localTaleId, state]),
        );

        for (const preference of syncPreferences) {
          if (preference.policy !== "sync") continue;
          const state = stateByLocalId.get(preference.localTaleId);
          const hasRemoteLink = state
            ? remoteById.has(state.remoteTaleId)
            : false;
          if (hasRemoteLink) continue;
          try {
            await uploadTalePackage({
              profile: activeProfile,
              transport,
              localTaleId: preference.localTaleId,
              idempotencyKey: `upload-${preference.localTaleId}-${Date.now()}`,
            });
          } catch (error) {
            console.warn("Background tale upload failed", error);
          }
        }

        for (const state of syncStates) {
          const remoteTale = remoteById.get(state.remoteTaleId);
          if (!remoteTale) continue;
          try {
            await syncLinkedTale({
              profile: activeProfile,
              transport,
              localTaleId: state.localTaleId,
              remoteTale,
              idempotencyKey: `sync-${state.localTaleId}-${Date.now()}`,
            });
          } catch (error) {
            console.warn("Background sync failed", error);
          }
        }
      } catch (error) {
        console.warn("Background sync refresh failed", error);
      } finally {
        notifySyncChanged();
        runningRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          void runSyncOnce();
        }
      }
    },
    [accessToken, accessTokenExpiresAt, dbReady, profile],
  );

  useEffect(() => {
    void syncOnce();
    const removeWakeListener = addSyncWakeListener(() => {
      void syncOnce();
    });
    const intervalId = window.setInterval(() => {
      void syncOnce();
    }, SYNC_INTERVAL_MS);
    return () => {
      removeWakeListener();
      window.clearInterval(intervalId);
    };
  }, [syncOnce]);
}
