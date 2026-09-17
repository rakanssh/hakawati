import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  deleteHostedRefreshToken,
  migrateStoredHostedRefreshToken,
  setHostedRefreshToken,
} from "./secret-store";

describe("secret-store", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("migrates an old persisted refresh token and removes plaintext", async () => {
    localStorage.setItem(
      "sync-settings",
      JSON.stringify({ state: { refreshToken: " old-refresh " }, version: 0 }),
    );
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(migrateStoredHostedRefreshToken("hosted")).resolves.toBe(true);

    expect(invokeMock).toHaveBeenCalledWith("set_hosted_refresh_token", {
      profileId: "hosted",
      token: "old-refresh",
    });
    expect(JSON.parse(localStorage.getItem("sync-settings")!)).toEqual({
      state: { hasRefreshToken: true },
      version: 0,
    });
  });

  it("removes plaintext even when secure migration fails", async () => {
    localStorage.setItem(
      "sync-settings",
      JSON.stringify({ state: { refreshToken: "old-refresh" }, version: 0 }),
    );
    invokeMock.mockRejectedValueOnce(new Error("no keyring"));

    await expect(migrateStoredHostedRefreshToken("hosted")).rejects.toThrow(
      "no keyring",
    );
    expect(JSON.parse(localStorage.getItem("sync-settings")!)).toEqual({
      state: { hasRefreshToken: false },
      version: 0,
    });
  });

  it("orders sign-out after an in-flight token write", async () => {
    let finishWrite!: () => void;
    invokeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    const write = setHostedRefreshToken("hosted", "rotated-token");
    await Promise.resolve();
    await Promise.resolve();
    const remove = deleteHostedRefreshToken("hosted");
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledOnce();
    finishWrite();
    await Promise.all([write, remove]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      "set_hosted_refresh_token",
      "delete_hosted_refresh_token",
    ]);
  });

  it("does not restore pre-sign-out settings when migration finishes late", async () => {
    const oldSettings = JSON.stringify({
      state: { accountId: "old-account", refreshToken: "old-token" },
      version: 0,
    });
    const signedOutSettings = JSON.stringify({
      state: { accountId: "", hasRefreshToken: false },
      version: 1,
    });
    localStorage.setItem("sync-settings", oldSettings);
    let finishWrite!: () => void;
    invokeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    const migration = migrateStoredHostedRefreshToken("hosted");
    await Promise.resolve();
    await Promise.resolve();
    localStorage.setItem("sync-settings", signedOutSettings);
    finishWrite();
    await migration;
    expect(localStorage.getItem("sync-settings")).toBe(signedOutSettings);
  });
});
