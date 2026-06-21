import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useRef } from "react";
import { getSyncProfile } from "@/repositories/sync.repository";
import {
  prepareHostedSync,
  signInHostedSync,
  type SyncProfile,
} from "@/services/sync";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { isTauriEnvironment } from "@/store/useUpdateStore";

const HOSTED_PROFILE_ID = "hosted";

export function useHostedSessionRecovery(dbReady: boolean) {
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const activeSyncMode = useSyncSettingsStore((state) => state.activeSyncMode);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const deviceName = useSyncSettingsStore((state) => state.deviceName);
  const devicePlatform = useSyncSettingsStore((state) => state.devicePlatform);
  const accountDisplayName = useSyncSettingsStore(
    (state) => state.accountDisplayName,
  );
  const accountEmail = useSyncSettingsStore((state) => state.accountEmail);
  const setAccessToken = useSyncSettingsStore((state) => state.setAccessToken);
  const setAccount = useSyncSettingsStore((state) => state.setAccount);
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
    const tokenExpired =
      accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
    const hasToken = accessToken.trim().length > 0 && !tokenExpired;
    const accountLabel = accountDisplayName || accountEmail;
    const key = `${profile.baseUrl}:${accountLabel}`;
    if (
      !dbReady ||
      !isTauriEnvironment() ||
      activeSyncMode !== "hosted" ||
      profile.baseUrl.length === 0 ||
      accountLabel.length === 0 ||
      hasToken ||
      triedKeyRef.current === key
    ) {
      return;
    }

    triedKeyRef.current = key;
    void (async () => {
      const storedProfile = await getSyncProfile(profile.id).catch(() => null);
      if (storedProfile?.enabled !== true) return;
      const result = await signInHostedSync({
        profile,
        prompt: "none",
        timeoutMs: 30_000,
      });
      const expiresAt =
        result.expiresIn && result.expiresIn > 0
          ? Date.now() + result.expiresIn * 1000
          : null;
      setAccessToken(result.accessToken, expiresAt);
      const appVersion = await getVersion().catch(() => "0.15.0");
      const prepared = await prepareHostedSync({
        profile,
        accessToken: result.accessToken,
        device: {
          id: deviceId.trim(),
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
      });
      setAccount({
        displayName: prepared.account.displayName,
        email: prepared.account.emailNormalized,
        emailVerified: prepared.account.emailVerified,
      });
    })().catch((error) => {
      console.info("Hosted sync session recovery skipped", error);
    });
  }, [
    accessToken,
    accessTokenExpiresAt,
    accountDisplayName,
    accountEmail,
    activeSyncMode,
    dbReady,
    deviceId,
    deviceName,
    devicePlatform,
    profile,
    setAccessToken,
    setAccount,
  ]);
}
