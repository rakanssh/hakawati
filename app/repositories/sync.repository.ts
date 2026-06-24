import {
  enqueueLocalOperation,
  enqueueLocalWrite,
} from "@/lib/local-write-queue";
import { getDb } from "@/services/db";
import type {
  SyncDisabledReason,
  SyncMode,
  SyncProfile,
} from "@/services/sync";

export type TaleSyncStatus = "idle" | "push" | "pull" | "conflict" | "error";
export type TaleSyncPolicy = "sync" | "private";

export type TaleSyncState = {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
  remoteTaleId: string;
  contentRev: string | null;
  metadataRev: string | null;
  lastSyncedAt: number | null;
  pendingStatus: TaleSyncStatus;
  lastErrorCode: string | null;
};

type SyncProfileRow = {
  id: string;
  base_url: string;
  mode: SyncMode;
  device_id?: string | null;
  enabled?: number | boolean;
  disabled_reason?: SyncDisabledReason | null;
  created_at: number;
  updated_at: number;
};

type TaleSyncStateRow = {
  profile_id: string;
  account_id: string;
  local_tale_id: string;
  remote_tale_id: string;
  content_rev: string | null;
  metadata_rev: string | null;
  last_synced_at: number | null;
  pending_status: TaleSyncStatus;
  last_error_code: string | null;
};

type TaleSyncPreferenceRow = {
  profile_id: string | null;
  account_id: string;
  local_tale_id: string;
  policy: TaleSyncPolicy;
  created_at: number;
  updated_at: number;
};

function mapProfile(row: SyncProfileRow): SyncProfile {
  return {
    id: row.id,
    baseUrl: row.base_url,
    mode: row.mode,
    deviceId: row.device_id ?? null,
    enabled: row.enabled === undefined ? true : Boolean(row.enabled),
    disabledReason: row.disabled_reason ?? null,
  };
}

function mapState(row: TaleSyncStateRow): TaleSyncState {
  return {
    profileId: row.profile_id,
    accountId: row.account_id || null,
    localTaleId: row.local_tale_id,
    remoteTaleId: row.remote_tale_id,
    contentRev: row.content_rev,
    metadataRev: row.metadata_rev,
    lastSyncedAt: row.last_synced_at,
    pendingStatus: row.pending_status,
    lastErrorCode: row.last_error_code,
  };
}

function mapPreference(row: TaleSyncPreferenceRow) {
  return {
    profileId: row.profile_id,
    accountId: row.account_id || null,
    localTaleId: row.local_tale_id,
    policy: row.policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertSyncProfile(profile: SyncProfile): Promise<void> {
  await enqueueLocalWrite(async () => {
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      `INSERT INTO sync_profiles (
         id,
         base_url,
         mode,
         device_id,
         enabled,
         disabled_reason,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         base_url = excluded.base_url,
         mode = excluded.mode,
         device_id = excluded.device_id,
         enabled = excluded.enabled,
         disabled_reason = excluded.disabled_reason,
         updated_at = excluded.updated_at`,
      [
        profile.id,
        profile.baseUrl,
        profile.mode,
        profile.deviceId ?? null,
        profile.enabled === false ? 0 : 1,
        profile.disabledReason ?? null,
        now,
        now,
      ],
    );
  });
}

export async function setSyncProfileDisabled(
  profileId: string,
  reason: SyncDisabledReason,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE sync_profiles
       SET enabled = 0, disabled_reason = ?, updated_at = ?
       WHERE id = ?`,
      [reason, Date.now(), profileId],
    );
  });
}

export async function setSyncProfileEnabled(profileId: string): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE sync_profiles
       SET enabled = 1, disabled_reason = NULL, updated_at = ?
       WHERE id = ?`,
      [Date.now(), profileId],
    );
  });
}

export async function getSyncProfile(
  profileId: string,
): Promise<SyncProfile | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<SyncProfileRow[]>(
      `SELECT * FROM sync_profiles WHERE id = ? LIMIT 1`,
      [profileId],
    );
    return rows[0] ? mapProfile(rows[0]) : null;
  });
}

export async function listSyncProfiles(): Promise<SyncProfile[]> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<SyncProfileRow[]>(
      `SELECT * FROM sync_profiles ORDER BY updated_at DESC`,
    );
    return rows.map(mapProfile);
  });
}

export async function getTaleSyncState(input: {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
}): Promise<TaleSyncState | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<TaleSyncStateRow[]>(
      `SELECT * FROM tale_sync_state
       WHERE profile_id = ? AND account_id = ? AND local_tale_id = ?
       LIMIT 1`,
      [input.profileId, accountScope(input.accountId), input.localTaleId],
    );
    return rows[0] ? mapState(rows[0]) : null;
  });
}

export async function listTaleSyncStates(
  profileId: string,
  accountId?: string | null,
): Promise<TaleSyncState[]> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<TaleSyncStateRow[]>(
      `SELECT * FROM tale_sync_state WHERE profile_id = ? AND account_id = ?`,
      [profileId, accountScope(accountId)],
    );
    return rows.map(mapState);
  });
}

export async function listSyncStatesForLocalTale(
  localTaleId: string,
): Promise<TaleSyncState[]> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<TaleSyncStateRow[]>(
      `SELECT * FROM tale_sync_state WHERE local_tale_id = ?`,
      [localTaleId],
    );
    return rows.map(mapState);
  });
}

export async function upsertTaleSyncState(state: TaleSyncState): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO tale_sync_state (
         profile_id,
         account_id,
         local_tale_id,
         remote_tale_id,
         content_rev,
         metadata_rev,
         last_synced_at,
         pending_status,
         last_error_code
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, account_id, local_tale_id) DO UPDATE SET
         remote_tale_id = excluded.remote_tale_id,
         content_rev = excluded.content_rev,
         metadata_rev = excluded.metadata_rev,
         last_synced_at = excluded.last_synced_at,
         pending_status = excluded.pending_status,
         last_error_code = excluded.last_error_code`,
      [
        state.profileId,
        accountScope(state.accountId),
        state.localTaleId,
        state.remoteTaleId,
        state.contentRev,
        state.metadataRev,
        state.lastSyncedAt,
        state.pendingStatus,
        state.lastErrorCode,
      ],
    );
  });
}

export async function deleteTaleSyncState(input: {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
}): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `DELETE FROM tale_sync_state
       WHERE profile_id = ? AND account_id = ? AND local_tale_id = ?`,
      [input.profileId, accountScope(input.accountId), input.localTaleId],
    );
  });
}

export async function setTaleSyncStatus(input: {
  profileId: string;
  accountId?: string | null;
  localTaleId: string;
  pendingStatus: TaleSyncStatus;
  lastErrorCode?: string | null;
}): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE tale_sync_state
       SET pending_status = ?, last_error_code = ?
       WHERE profile_id = ? AND account_id = ? AND local_tale_id = ?`,
      [
        input.pendingStatus,
        input.lastErrorCode ?? null,
        input.profileId,
        accountScope(input.accountId),
        input.localTaleId,
      ],
    );
  });
}

export async function setTaleSyncPreference(input: {
  profileId?: string | null;
  accountId?: string | null;
  localTaleId: string;
  policy: TaleSyncPolicy;
}): Promise<void> {
  await enqueueLocalWrite(async () => {
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      `INSERT INTO tale_sync_preferences (
         profile_id,
         account_id,
         local_tale_id,
         policy,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, account_id, local_tale_id) DO UPDATE SET
         policy = excluded.policy,
         updated_at = excluded.updated_at`,
      [
        input.profileId ?? null,
        accountScope(input.accountId),
        input.localTaleId,
        input.policy,
        now,
        now,
      ],
    );
  });
}

export async function getTaleSyncPreference(input: {
  profileId?: string | null;
  accountId?: string | null;
  localTaleId: string;
}) {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<TaleSyncPreferenceRow[]>(
      `SELECT * FROM tale_sync_preferences
       WHERE profile_id IS ? AND account_id = ? AND local_tale_id = ?
       LIMIT 1`,
      [
        input.profileId ?? null,
        accountScope(input.accountId),
        input.localTaleId,
      ],
    );
    return rows[0] ? mapPreference(rows[0]) : null;
  });
}

export async function listTaleSyncPreferences(
  profileId?: string | null,
  accountId?: string | null,
) {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    const rows = await db.select<TaleSyncPreferenceRow[]>(
      `SELECT * FROM tale_sync_preferences
       WHERE profile_id IS ? AND account_id = ?`,
      [profileId ?? null, accountScope(accountId)],
    );
    return rows.map(mapPreference);
  });
}

function accountScope(accountId?: string | null) {
  return accountId?.trim() ?? "";
}
