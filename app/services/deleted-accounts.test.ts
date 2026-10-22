import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

const repo = vi.hoisted(() => ({ forgetSyncAccount: vi.fn() }));
vi.mock("@/repositories/sync.repository", () => repo);

import { unlinkDeletedAccounts } from "./deleted-accounts";

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
