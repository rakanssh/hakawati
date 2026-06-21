import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  prepareHostedSync: vi.fn(),
  signInHostedSync: vi.fn(),
}));

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "",
  accessTokenExpiresAt: null as number | null,
  deviceId: "device-1",
  deviceName: "Laptop",
  devicePlatform: "windows",
  accountDisplayName: "Player",
  accountEmail: "player@example.com",
  setAccessToken: vi.fn(),
  setAccount: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.15.0"),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);

vi.mock("@/services/sync", () => syncServiceMocks);

vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));

vi.mock("@/store/useUpdateStore", () => ({
  isTauriEnvironment: () => true,
}));

import { useHostedSessionRecovery } from "./useHostedSessionRecovery";

function renderHarness(dbReady = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Harness() {
    useHostedSessionRecovery(dbReady);
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
        await Promise.resolve();
      });
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useHostedSessionRecovery", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    Object.assign(syncStoreState, {
      cloudBaseUrl: "https://sync.example",
      activeSyncMode: "hosted",
      accessToken: "",
      accessTokenExpiresAt: null,
      deviceId: "device-1",
      deviceName: "Laptop",
      devicePlatform: "windows",
      accountDisplayName: "Player",
      accountEmail: "player@example.com",
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.signInHostedSync.mockResolvedValue({
      accessToken: "token",
      expiresIn: 3600,
    });
    syncServiceMocks.prepareHostedSync.mockResolvedValue({
      account: {
        displayName: "Player",
        emailNormalized: "player@example.com",
        emailVerified: true,
      },
      device: { id: "device-1" },
    });
  });

  it("silently restores hosted sync when a persisted account has no token", async () => {
    const harness = renderHarness();
    await harness.flush();

    expect(syncServiceMocks.signInHostedSync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "none",
        timeoutMs: 30_000,
      }),
    );
    expect(syncServiceMocks.prepareHostedSync).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "token",
        device: expect.objectContaining({ id: "device-1" }),
      }),
    );
    expect(syncStoreState.setAccessToken).toHaveBeenCalledWith(
      "token",
      expect.any(Number),
    );
    expect(syncStoreState.setAccount).toHaveBeenCalledWith({
      displayName: "Player",
      email: "player@example.com",
      emailVerified: true,
    });

    harness.cleanup();
  });

  it("does not restore hosted sync when the stored profile is disabled", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const harness = renderHarness();
    await harness.flush();

    expect(syncServiceMocks.signInHostedSync).not.toHaveBeenCalled();
    expect(syncServiceMocks.prepareHostedSync).not.toHaveBeenCalled();
    expect(syncStoreState.setAccessToken).not.toHaveBeenCalled();

    harness.cleanup();
  });
});
