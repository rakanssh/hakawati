import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  refreshHostedSync: vi.fn(),
}));

const secretStoreMocks = vi.hoisted(() => ({
  getHostedRefreshToken: vi.fn(),
  migrateStoredHostedRefreshToken: vi.fn(),
  setHostedRefreshToken: vi.fn(),
}));

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "old-token",
  accessTokenExpiresAt: Date.now() - 1,
  hasRefreshToken: true,
  deviceId: "device-1",
  accountId: "account-1",
  hostedDeviceIdsByAccountId: { "account-1": "device-1" },
  setAccessToken: vi.fn(),
  setHasRefreshToken: vi.fn(),
  setHostedRefreshFailed: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", () => syncServiceMocks);
vi.mock("@/services/secret-store", () => secretStoreMocks);
vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));

import { useHostedTokenRefresh } from "./useHostedTokenRefresh";

function renderHarness(dbReady = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Harness() {
    useHostedTokenRefresh(dbReady);
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });

  return {
    async flush() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useHostedTokenRefresh", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.clearAllMocks();
    Object.assign(syncStoreState, {
      cloudBaseUrl: "https://sync.example",
      activeSyncMode: "hosted",
      accessToken: "old-token",
      accessTokenExpiresAt: Date.now() - 1,
      hasRefreshToken: true,
      deviceId: "device-1",
      accountId: "account-1",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    secretStoreMocks.getHostedRefreshToken.mockResolvedValue("refresh-token");
    secretStoreMocks.migrateStoredHostedRefreshToken.mockResolvedValue(false);
    secretStoreMocks.setHostedRefreshToken.mockResolvedValue(undefined);
    syncServiceMocks.refreshHostedSync.mockResolvedValue({
      accessToken: "new-token",
      expiresIn: 3600,
      refreshToken: "new-refresh-token",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes an expired hosted token without browser auth", async () => {
    const harness = renderHarness();
    await harness.flush();

    expect(syncServiceMocks.refreshHostedSync).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: "refresh-token" }),
    );
    expect(syncStoreState.setAccessToken).toHaveBeenCalledWith(
      "new-token",
      expect.any(Number),
      true,
    );
    expect(secretStoreMocks.setHostedRefreshToken).toHaveBeenCalledWith(
      "hosted",
      "new-refresh-token",
    );
    expect(syncStoreState.setHostedRefreshFailed).toHaveBeenCalledWith(false);

    harness.cleanup();
  });

  it("migrates an old localStorage refresh token before refreshing", async () => {
    syncStoreState.hasRefreshToken = false;
    secretStoreMocks.migrateStoredHostedRefreshToken.mockResolvedValueOnce(
      true,
    );

    const harness = renderHarness();
    await harness.flush();

    expect(
      secretStoreMocks.migrateStoredHostedRefreshToken,
    ).toHaveBeenCalledWith("hosted");
    expect(syncStoreState.setHasRefreshToken).toHaveBeenCalledWith(true);
    expect(syncServiceMocks.refreshHostedSync).toHaveBeenCalledOnce();

    harness.cleanup();
  });

  it.each(["signed_out", "user_disabled", "device_limit"] as const)(
    "does not refresh when the hosted profile is %s",
    async (disabledReason) => {
      syncRepoMocks.getSyncProfile.mockResolvedValueOnce({
        enabled: false,
        disabledReason,
      });

      const harness = renderHarness();
      await harness.flush();

      expect(syncServiceMocks.refreshHostedSync).not.toHaveBeenCalled();

      harness.cleanup();
    },
  );

  it("marks the hosted session when silent refresh fails", async () => {
    syncServiceMocks.refreshHostedSync.mockRejectedValueOnce(
      new Error("invalid_grant"),
    );

    const harness = renderHarness();
    await harness.flush();

    expect(syncStoreState.setHostedRefreshFailed).toHaveBeenCalledWith(true);

    harness.cleanup();
  });

  it("falls back to reconnect when secure storage has no token", async () => {
    secretStoreMocks.getHostedRefreshToken.mockResolvedValueOnce(null);

    const harness = renderHarness();
    await harness.flush();

    expect(syncServiceMocks.refreshHostedSync).not.toHaveBeenCalled();
    expect(syncStoreState.setHasRefreshToken).toHaveBeenCalledWith(false);
    expect(syncStoreState.setHostedRefreshFailed).toHaveBeenCalledWith(true);

    harness.cleanup();
  });
});
