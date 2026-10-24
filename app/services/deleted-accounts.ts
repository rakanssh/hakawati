import { forgetSyncAccount } from "@/repositories/sync.repository";
import { deleteHostedAccount, type SyncTransport } from "@/services/sync";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const HOSTED_PROFILE_ID = "hosted";

export async function deleteCloudAccount(
  transport: SyncTransport,
  accountId: string,
): Promise<void> {
  await deleteHostedAccount(transport);
  useSyncSettingsStore.getState().addDeletedAccount(accountId);
  void unlinkDeletedAccounts();
}

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
