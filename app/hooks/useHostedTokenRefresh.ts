import { useEffect, useMemo, useRef } from "react";
import { getSyncProfile } from "@/repositories/sync.repository";
import { refreshHostedSync, type SyncProfile } from "@/services/sync";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";
const REFRESH_SKEW_MS = 60_000;

export function useHostedTokenRefresh(dbReady: boolean) {
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const activeSyncMode = useSyncSettingsStore((state) => state.activeSyncMode);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const refreshToken = useSyncSettingsStore((state) => state.refreshToken);
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const setAccessToken = useSyncSettingsStore((state) => state.setAccessToken);
  const setHostedRefreshFailed = useSyncSettingsStore(
    (state) => state.setHostedRefreshFailed,
  );
  const triedKeyRef = useRef("");

  const profile = useMemo<SyncProfile>(
    () => ({
      id: HOSTED_PROFILE_ID,
      baseUrl: cloudBaseUrl.trim(),
      mode: "hosted",
      deviceId: deviceId.trim(),
    }),
    [cloudBaseUrl, deviceId],
  );

  useEffect(() => {
    if (
      !dbReady ||
      activeSyncMode !== "hosted" ||
      profile.baseUrl.length === 0 ||
      refreshToken.trim().length === 0
    ) {
      return;
    }

    const refresh = async () => {
      const storedProfile = await getSyncProfile(profile.id).catch(() => null);
      if (storedProfile?.enabled !== true) return;
      const result = await refreshHostedSync({
        profile,
        refreshToken: refreshToken.trim(),
      });
      const nextExpiresAt =
        result.expiresIn && result.expiresIn > 0
          ? Date.now() + result.expiresIn * 1000
          : null;
      setAccessToken(
        result.accessToken,
        nextExpiresAt,
        result.refreshToken ?? refreshToken,
      );
      setHostedRefreshFailed(false);
    };

    const expiresAt = accessTokenExpiresAt ?? Number.POSITIVE_INFINITY;
    const refreshIn = expiresAt - Date.now() - REFRESH_SKEW_MS;
    if (accessToken.trim().length > 0 && refreshIn > 0) {
      const timer = window.setTimeout(() => {
        triedKeyRef.current = "";
        void refresh().catch((error) => {
          console.info("Hosted sync token refresh skipped", error);
          setHostedRefreshFailed(true);
        });
      }, refreshIn);
      return () => window.clearTimeout(timer);
    }

    const key = `${profile.baseUrl}:${refreshToken}:${accessTokenExpiresAt ?? 0}`;
    if (triedKeyRef.current === key) return;
    triedKeyRef.current = key;

    void refresh().catch((error) => {
      console.info("Hosted sync token refresh skipped", error);
      setHostedRefreshFailed(true);
    });
  }, [
    accessToken,
    accessTokenExpiresAt,
    activeSyncMode,
    dbReady,
    profile,
    refreshToken,
    setAccessToken,
    setHostedRefreshFailed,
  ]);
}
