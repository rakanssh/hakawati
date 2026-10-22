import { forgetSyncAccount } from "@/repositories/sync.repository";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";

/**
 * Unlinks this device's tales from cloud accounts deleted here, so they stay as
 * local tales. An account stays listed until that works, and the app tries
 * again the next time it starts.
 */
export async function unlinkDeletedAccounts(): Promise<void> {
  for (const accountId of useSyncSettingsStore.getState().deletedAccountIds) {
    try {
      await forgetSyncAccount(HOSTED_PROFILE_ID, accountId);
      useSyncSettingsStore.getState().removeDeletedAccount(accountId);
    } catch (error) {
      console.warn(
        "Couldn't unlink tales from a deleted account; will retry",
        error,
      );
    }
  }
}
