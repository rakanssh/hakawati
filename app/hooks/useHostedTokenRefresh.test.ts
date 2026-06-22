import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  refreshHostedSync: vi.fn(),
}));

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "old-token",
  accessTokenExpiresAt: Date.now() - 1,
  refreshToken: "refresh-token",
  deviceId: "device-1",
  setAccessToken: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", () => syncServiceMocks);
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
    vi.clearAllMocks();
    Object.assign(syncStoreState, {
      cloudBaseUrl: "https://sync.example",
      activeSyncMode: "hosted",
      accessToken: "old-token",
      accessTokenExpiresAt: Date.now() - 1,
      refreshToken: "refresh-token",
      deviceId: "device-1",
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.refreshHostedSync.mockResolvedValue({
      accessToken: "new-token",
      expiresIn: 3600,
      refreshToken: "new-refresh-token",
    });
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
      "new-refresh-token",
    );

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
});
