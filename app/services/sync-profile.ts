import {
  getSyncProfile,
  setSyncProfileDisabled,
  upsertSyncProfile,
} from "@/repositories/sync.repository";
import type { SyncDisabledReason, SyncProfile } from "@/types/sync.type";

export function loadSyncProfile(
  profileId: string,
): Promise<SyncProfile | null> {
  return getSyncProfile(profileId);
}

export function enableSyncProfile(profile: SyncProfile): Promise<void> {
  return upsertSyncProfile({ ...profile, enabled: true, disabledReason: null });
}

export function disableSyncProfile(
  profileId: string,
  reason: SyncDisabledReason,
): Promise<void> {
  return setSyncProfileDisabled(profileId, reason);
}
