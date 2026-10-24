import { useEffect, useMemo, useRef } from "react";
import { i18n } from "@lingui/core";
import { toast } from "sonner";
import { createUploadIdempotencyKey } from "@/lib/sync-idempotency";
import { isRefusedSyncError } from "@/lib/sync-ui";
import {
  deleteTaleSyncState,
  getSyncProfile,
  listTaleSyncPreferences,
  listTaleSyncStates,
  retryCloudFullTaleSyncs,
  setSyncProfileDisabled,
  setTaleSyncPreference,
  setTaleSyncStatus,
  upsertTaleSyncState,
} from "@/repositories/sync.repository";
import { isTaleInPlay, showPulledTale } from "@/services/open-tale-sync";
import {
  assertSyncAvailable,
  createSyncTransport,
  fetchSyncCapabilities,
  isUpdateRequiredError,
  listAllRemoteTales,
  listHostedDevices,
  SyncHttpError,
  syncLinkedTale,
  uploadTalePackage,
} from "@/services/sync";
import type { SyncProfile } from "@/types/sync.type";
import { addSyncWakeListener, notifySyncChanged } from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";
const SYNC_INTERVAL_MS = 60_000;

type CloudFull = {
  scope: string;
  remoteTaleCount: number;
  holdsChanges: boolean;
};

function isCloudFullError(error: unknown) {
  return error instanceof SyncHttpError && error.code === "quota_exceeded";
}

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
  const setCloudUpdateRequired = useSyncSettingsStore(
    (state) => state.setCloudUpdateRequired,
  );
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const latestRunRef = useRef<(() => Promise<void>) | null>(null);
  const notifiedUploadOperationKeysRef = useRef(new Set<string>());
  const refusedUploadsRef = useRef(new Set<string>());
  const cloudFullRef = useRef<CloudFull | null>(null);
  const retriedCloudFullScopesRef = useRef(new Set<string>());

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
        const scope = JSON.stringify([
          activeProfile.id,
          activeProfile.baseUrl,
          activeProfile.accountId ?? "",
        ]);
        const writerId = activeProfile.deviceId || deviceId.trim();
        const transport = createSyncTransport({
          profile: activeProfile,
          signal,
          accessToken:
            activeProfile.mode === "hosted" ? accessToken.trim() : undefined,
        });
        const capabilities = await fetchSyncCapabilities(transport);
        if (signal.aborted) return;
        assertSyncAvailable(capabilities);
        setCloudUpdateRequired(false);
        if (activeProfile.mode === "hosted") {
          if (!activeProfile.accountId) return;
          const devices = await listHostedDevices(transport);
          if (signal.aborted) return;
          if (!devices.some((device) => device.id === activeProfile.deviceId)) {
            await setSyncProfileDisabled(activeProfile.id, "user_disabled");
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

        const cloudFull =
          cloudFullRef.current?.scope === scope ? cloudFullRef.current : null;
        if (!cloudFull || remoteTales.length < cloudFull.remoteTaleCount) {
          if (cloudFull || !retriedCloudFullScopesRef.current.has(scope)) {
            await retryCloudFullTaleSyncs(
              activeProfile.id,
              activeProfile.accountId,
            );
            if (signal.aborted) return;
            retriedCloudFullScopesRef.current.add(scope);
          }
          cloudFullRef.current = null;
        }
        const noteCloudFull = (holdsChanges: boolean) => {
          if (cloudFullRef.current) {
            cloudFullRef.current.holdsChanges ||= holdsChanges;
            return;
          }
          cloudFullRef.current = {
            scope,
            remoteTaleCount: remoteTales.length,
            holdsChanges,
          };
          toast.error(i18n._("Cloud storage is full"));
        };

        const forgetRemovedCloudTale = async (localTaleId: string) => {
          await setTaleSyncPreference({
            profileId: activeProfile.id,
            accountId: activeProfile.accountId,
            localTaleId,
            policy: "private",
          });
          if (signal.aborted) return;
          await deleteTaleSyncState({
            profileId: activeProfile.id,
            accountId: activeProfile.accountId,
            localTaleId,
          });
        };
        const forgottenLocalIds = new Set<string>();

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
            await forgetRemovedCloudTale(state.localTaleId);
            forgottenLocalIds.add(state.localTaleId);
            continue;
          }
          const refusedKey = JSON.stringify([scope, preference.localTaleId]);
          if (cloudFullRef.current || refusedUploadsRef.current.has(refusedKey))
            continue;
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
            if (isUpdateRequiredError(error)) throw error;
            console.warn("Background tale upload failed", error);
            if (isCloudFullError(error)) {
              noteCloudFull(false);
              continue;
            }
            if (
              error instanceof SyncHttpError &&
              (isRefusedSyncError(error.code) ||
                error.code === "idempotency_conflict")
            ) {
              refusedUploadsRef.current.add(refusedKey);
            }
            if (!notifiedUploadOperationKeysRef.current.has(idempotencyKey)) {
              notifiedUploadOperationKeysRef.current.add(idempotencyKey);
              toast.error(i18n._("Failed to upload tale to cloud"));
            }
          }
        }

        for (const state of syncStates) {
          if (signal.aborted) return;
          const remoteTale = remoteById.get(state.remoteTaleId);
          if (!remoteTale) {
            if (!forgottenLocalIds.has(state.localTaleId)) {
              await forgetRemovedCloudTale(state.localTaleId);
            }
            continue;
          }
          const hasChanges =
            state.pendingStatus === "push" ||
            (state.pendingStatus === "error" &&
              state.lastErrorCode === "quota_exceeded");
          if (cloudFullRef.current?.holdsChanges && hasChanges) {
            await setTaleSyncStatus({
              profileId: activeProfile.id,
              accountId: activeProfile.accountId,
              localTaleId: state.localTaleId,
              pendingStatus: "error",
              lastErrorCode: "quota_exceeded",
            });
            if (signal.aborted) return;
          }
          try {
            const result = await syncLinkedTale({
              profile: activeProfile,
              transport,
              localTaleId: state.localTaleId,
              remoteTale,
              writerId,
              capabilities,
              canPull: () => !isTaleInPlay(state.localTaleId),
            });
            if (result === "pulled" && !signal.aborted) {
              await showPulledTale(state.localTaleId);
            }
          } catch (error) {
            if (signal.aborted) return;
            if (isUpdateRequiredError(error)) throw error;
            console.warn("Background sync failed", error);
            if (isCloudFullError(error)) noteCloudFull(true);
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          if (isUpdateRequiredError(error)) setCloudUpdateRequired(true);
          console.warn("Background sync refresh failed", error);
        }
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
  }, [
    accessToken,
    accessTokenExpiresAt,
    dbReady,
    deviceId,
    profile,
    setCloudUpdateRequired,
  ]);
}
