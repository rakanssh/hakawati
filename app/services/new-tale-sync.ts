import {
  getSyncProfile,
  listTaleSyncPreferences,
  listTaleSyncStates,
  setTaleSyncPreference,
} from "@/repositories/sync.repository";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import { getAllTales } from "@/services/tale.service";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";

export type NewTaleSyncPolicy = "default" | "private";
export type UndecidedTale = {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
};

export async function canSyncNewTales() {
  const settings = useSyncSettingsStore.getState();
  const profileId =
    settings.activeSyncMode === "personal"
      ? PERSONAL_PROFILE_ID
      : HOSTED_PROFILE_ID;
  const accountId =
    settings.activeSyncMode === "hosted" ? settings.accountId || null : null;
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
  return (
    baseUrl.length > 0 &&
    (settings.activeSyncMode === "personal" || Boolean(accountId)) &&
    (settings.activeSyncMode === "personal" || hostedReady) &&
    storedProfile?.enabled === true
  );
}

export async function markNewTaleSyncPreference(
  localTaleId: string,
  policy: NewTaleSyncPolicy = "default",
) {
  const settings = useSyncSettingsStore.getState();
  const profileId =
    settings.activeSyncMode === "personal"
      ? PERSONAL_PROFILE_ID
      : HOSTED_PROFILE_ID;
  const accountId =
    settings.activeSyncMode === "hosted" ? settings.accountId || null : null;
  if (policy === "private") {
    await setTaleSyncPreference({
      profileId,
      accountId,
      localTaleId,
      policy: "private",
    });
    return;
  }

  if (!(await canSyncNewTales())) return;

  await setTaleSyncPreference({
    profileId,
    accountId,
    localTaleId,
    policy: "sync",
  });
  wakeSyncBackground();
}

export async function listUndecidedTales(
  profileId: string,
  accountId?: string | null,
): Promise<UndecidedTale[]> {
  const first = await getAllTales(1, 100);
  const pages = [first];
  for (let page = 2; (page - 1) * 100 < first.total; page += 1) {
    pages.push(await getAllTales(page, 100));
  }

  const [syncStates, syncPreferences] = await Promise.all([
    listTaleSyncStates(profileId, accountId),
    listTaleSyncPreferences(profileId, accountId),
  ]);
  const decidedIds = new Set([
    ...syncStates.map((state) => state.localTaleId),
    ...syncPreferences.map((preference) => preference.localTaleId),
  ]);

  return pages
    .flatMap((page) => page.data)
    .filter((tale) => !decidedIds.has(tale.id))
    .map((tale) => ({
      id: tale.id,
      name: tale.name,
      description: tale.lastLogEntry?.text || tale.description,
      updatedAt: tale.updatedAt,
    }));
}

export async function decideTaleSyncPreference(
  profileId: string,
  accountId: string | null | undefined,
  localTaleId: string,
  policy: "sync" | "private",
) {
  await setTaleSyncPreference({ profileId, accountId, localTaleId, policy });
  if (policy === "sync") wakeSyncBackground();
}

export async function decideAllTaleSyncPreferences(
  profileId: string,
  accountId: string | null | undefined,
  localTaleIds: string[],
  policy: "sync" | "private",
) {
  await Promise.all(
    localTaleIds.map((localTaleId) =>
      setTaleSyncPreference({ profileId, accountId, localTaleId, policy }),
    ),
  );
  if (policy === "sync") wakeSyncBackground();
}
