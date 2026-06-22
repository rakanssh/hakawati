import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { migrateStoredHostedRefreshToken } from "./secret-store";

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
});
