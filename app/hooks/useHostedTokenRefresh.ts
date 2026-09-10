import { useEffect, useMemo } from "react";
import { getSyncProfile } from "@/repositories/sync.repository";
import {
  getHostedRefreshToken,
  migrateStoredHostedRefreshToken,
  setHostedRefreshToken,
} from "@/services/secret-store";
import {
  refreshHostedSync,
  SyncHttpError,
  type SyncProfile,
} from "@/services/sync";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";
const REFRESH_SKEW_MS = 60_000;
const REFRESH_RETRY_MS = 60_000;

export function useHostedTokenRefresh(dbReady: boolean) {
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const activeSyncMode = useSyncSettingsStore((state) => state.activeSyncMode);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const hasRefreshToken = useSyncSettingsStore(
    (state) => state.hasRefreshToken,
  );
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const accountId = useSyncSettingsStore((state) => state.accountId);
  const hostedDeviceIdsByAccountId = useSyncSettingsStore(
    (state) => state.hostedDeviceIdsByAccountId,
  );
  const setAccessToken = useSyncSettingsStore((state) => state.setAccessToken);
  const setHasRefreshToken = useSyncSettingsStore(
    (state) => state.setHasRefreshToken,
  );
  const setHostedRefreshFailed = useSyncSettingsStore(
    (state) => state.setHostedRefreshFailed,
  );

  const profile = useMemo<SyncProfile>(
    () => ({
      id: HOSTED_PROFILE_ID,
      baseUrl: cloudBaseUrl.trim(),
      mode: "hosted",
      accountId: accountId || null,
      deviceId: accountId
        ? (hostedDeviceIdsByAccountId[accountId] ?? deviceId).trim()
        : deviceId.trim(),
    }),
    [accountId, cloudBaseUrl, deviceId, hostedDeviceIdsByAccountId],
  );

  useEffect(() => {
    if (
      !dbReady ||
      activeSyncMode !== "hosted" ||
      profile.baseUrl.length === 0
    ) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let retryPending = false;

    const refresh = async () => {
      const migrated = await migrateStoredHostedRefreshToken(profile.id);
      if (cancelled) return;
      if (!hasRefreshToken && !migrated) return;

      const storedProfile = await getSyncProfile(profile.id).catch(() => null);
      if (cancelled) return;
      if (storedProfile?.enabled !== true) return;
      const refreshToken = await getHostedRefreshToken(profile.id);
      if (cancelled) return;
      if (!refreshToken) {
        setHasRefreshToken(false);
        setHostedRefreshFailed(true);
        return;
      }

      const result = await refreshHostedSync({
        profile,
        refreshToken,
      });
      if (cancelled) return;
      if (result.refreshToken) {
        await setHostedRefreshToken(profile.id, result.refreshToken);
        if (cancelled) return;
      }
      const nextExpiresAt =
        result.expiresIn && result.expiresIn > 0
          ? Date.now() + result.expiresIn * 1000
          : null;
      setAccessToken(result.accessToken, nextExpiresAt, true);
      setHasRefreshToken(true);
      setHostedRefreshFailed(false);
    };

    const attemptRefresh = async () => {
      retryPending = false;
      try {
        await refresh();
      } catch (error) {
        if (cancelled) return;
        console.info("Hosted sync token refresh skipped", error);
        const retryable =
          !(error instanceof SyncHttpError) ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500;
        setHostedRefreshFailed(!retryable);
        if (retryable) {
          retryPending = true;
          timer = window.setTimeout(() => {
            void attemptRefresh();
          }, REFRESH_RETRY_MS);
        }
      }
    };

    const retryWhenOnline = () => {
      if (!retryPending) return;
      window.clearTimeout(timer);
      void attemptRefresh();
    };

    // An access token with no advertised expiry has no meaningful refresh
    // deadline. Passing Infinity to setTimeout instead triggers it immediately.
    if (accessToken.trim().length > 0 && accessTokenExpiresAt === null) return;
    const expiresAt = accessTokenExpiresAt ?? 0;
    const refreshIn = expiresAt - Date.now() - REFRESH_SKEW_MS;
    if (accessToken.trim().length > 0 && refreshIn > 0) {
      timer = window.setTimeout(() => {
        void attemptRefresh();
      }, refreshIn);
    } else {
      void attemptRefresh();
    }
    window.addEventListener("online", retryWhenOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", retryWhenOnline);
    };
  }, [
    accessToken,
    accessTokenExpiresAt,
    activeSyncMode,
    dbReady,
    hasRefreshToken,
    profile,
    setAccessToken,
    setHasRefreshToken,
    setHostedRefreshFailed,
  ]);
}
