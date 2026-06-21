import {
  getSyncProfile,
  setTaleSyncPreference,
} from "@/repositories/sync.repository";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";

export type NewTaleSyncPolicy = "default" | "private";

export async function markNewTaleSyncPreference(
  localTaleId: string,
  policy: NewTaleSyncPolicy = "default",
) {
  const settings = useSyncSettingsStore.getState();
  const profileId =
    settings.activeSyncMode === "personal"
      ? PERSONAL_PROFILE_ID
      : HOSTED_PROFILE_ID;
  const baseUrl =
    settings.activeSyncMode === "personal"
      ? settings.personalBaseUrl.trim()
      : settings.cloudBaseUrl.trim();
  const tokenExpired =
    settings.accessTokenExpiresAt !== null &&
    settings.accessTokenExpiresAt <= Date.now();
  const hostedReady =
    (settings.accessToken.trim().length > 0 && !tokenExpired) ||
    Boolean(settings.accountDisplayName || settings.accountEmail);
  const storedProfile = await getSyncProfile(profileId).catch(() => null);
  const connected =
    baseUrl.length > 0 &&
    (settings.activeSyncMode === "personal" || hostedReady) &&
    storedProfile?.enabled === true;

  const syncPolicy = policy === "private" || !connected ? "private" : "sync";
  await setTaleSyncPreference({
    profileId,
    localTaleId,
    policy: syncPolicy,
  });
  if (syncPolicy === "sync") wakeSyncBackground();
}
