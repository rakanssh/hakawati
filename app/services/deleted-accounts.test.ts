import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncTransport } from "@/services/sync";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const repo = vi.hoisted(() => ({ forgetSyncAccount: vi.fn() }));
vi.mock("@/repositories/sync.repository", () => repo);
const sync = vi.hoisted(() => ({ deleteHostedAccount: vi.fn() }));
vi.mock("@/services/sync", () => sync);

import { deleteCloudAccount, unlinkDeletedAccounts } from "./deleted-accounts";

const transport = {} as SyncTransport;

describe("deleteCloudAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncSettingsStore.setState({ deletedAccountIds: [] });
  });

  it("records the deleted account and starts unlinking without waiting for it", async () => {
    sync.deleteHostedAccount.mockResolvedValue(undefined);
    repo.forgetSyncAccount.mockReturnValue(new Promise<void>(() => {}));

    await deleteCloudAccount(transport, "account-1");

    expect(sync.deleteHostedAccount).toHaveBeenCalledWith(transport);
    expect(useSyncSettingsStore.getState().deletedAccountIds).toEqual([
      "account-1",
    ]);
    expect(repo.forgetSyncAccount).toHaveBeenCalledWith("hosted", "account-1");
  });

  it("records nothing when the server refuses", async () => {
    sync.deleteHostedAccount.mockRejectedValue(new Error("Network down"));

    await expect(deleteCloudAccount(transport, "account-1")).rejects.toThrow(
      "Network down",
    );

    expect(useSyncSettingsStore.getState().deletedAccountIds).toEqual([]);
    expect(repo.forgetSyncAccount).not.toHaveBeenCalled();
  });
});

describe("unlinkDeletedAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncSettingsStore.setState({ deletedAccountIds: [] });
  });

  it("unlinks each deleted account's tales and forgets the account", async () => {
    repo.forgetSyncAccount.mockResolvedValue(undefined);
    useSyncSettingsStore.getState().addDeletedAccount("account-1");
    useSyncSettingsStore.getState().addDeletedAccount("account-2");

    await unlinkDeletedAccounts();

    expect(repo.forgetSyncAccount).toHaveBeenCalledWith("hosted", "account-1");
    expect(repo.forgetSyncAccount).toHaveBeenCalledWith("hosted", "account-2");
    expect(useSyncSettingsStore.getState().deletedAccountIds).toEqual([]);
  });

  it("keeps an account listed when unlinking fails, so the next run retries it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    repo.forgetSyncAccount
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce(undefined);
    useSyncSettingsStore.getState().addDeletedAccount("account-1");

    await unlinkDeletedAccounts();
    expect(useSyncSettingsStore.getState().deletedAccountIds).toEqual([
      "account-1",
    ]);

    await unlinkDeletedAccounts();
    expect(useSyncSettingsStore.getState().deletedAccountIds).toEqual([]);
  });
});
