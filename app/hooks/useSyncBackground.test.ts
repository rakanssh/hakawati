import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import {
  addSyncChangedListener,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import { useSyncBackground } from "./useSyncBackground";
import { useTaleStore } from "@/store/useTaleStore";

i18n.load("en", {});
i18n.activate("en");

const syncRepoMocks = vi.hoisted(() => ({
  deleteTaleSyncState: vi.fn(),
  getSyncProfile: vi.fn(),
  listTaleSyncPreferences: vi.fn(),
  listTaleSyncStates: vi.fn(),
  setSyncProfileDisabled: vi.fn(),
  setTaleSyncPreference: vi.fn(),
  upsertTaleSyncState: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => {
  return {
    assertSyncAvailable: vi.fn(),
    createSyncTransport: vi.fn((_options: { signal?: AbortSignal }) => ({
      transport: true,
    })),
    fetchSyncCapabilities: vi.fn(),
    listAllRemoteTales: vi.fn(),
    listHostedDevices: vi.fn(),
    syncLinkedTale: vi.fn(),
    uploadTalePackage: vi.fn(),
  };
});

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  personalBaseUrl: "",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "token",
  accessTokenExpiresAt: null as number | null,
  deviceId: "device-1",
  accountId: "account-1",
  hostedDeviceIdsByAccountId: { "account-1": "device-1" },
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", () => syncServiceMocks);
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));
vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));
vi.mock("sonner", () => ({ toast: toastMocks }));

function renderHarness(dbReady = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Harness() {
    useSyncBackground(dbReady);
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });

  return {
    rerender() {
      act(() => root.render(createElement(Harness)));
    },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function waitForAssertion(assertion: () => void) {
  await act(async () => {
    await vi.waitFor(assertion);
  });
}

describe("useSyncBackground", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    Object.assign(syncStoreState, {
      cloudBaseUrl: "https://sync.example",
      personalBaseUrl: "",
      activeSyncMode: "hosted",
      accessToken: "token",
      accessTokenExpiresAt: null,
      deviceId: "device-1",
      accountId: "account-1",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.setSyncProfileDisabled.mockResolvedValue(undefined);
    syncRepoMocks.deleteTaleSyncState.mockResolvedValue(undefined);
    syncRepoMocks.setTaleSyncPreference.mockResolvedValue(undefined);
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([]);
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([]);
    syncRepoMocks.upsertTaleSyncState.mockResolvedValue(undefined);
    syncServiceMocks.fetchSyncCapabilities.mockResolvedValue({
      server: "hakawati-cloud",
      apiVersion: "1",
      minimumClientVersion: "0.0.0",
      compatibility: { state: "compatible" },
      cloudSaveProtocol: 1,
      features: {
        sync: { state: "available" },
        catalogRead: { state: "available" },
        coverStorage: { state: "available" },
        publishing: { state: "available" },
      },
      limits: {
        maxPackageBytes: 1_000_000,
        maxStateBytes: 1_000_000,
      },
      scenarioCatalog: {
        packageFormatVersion: 1,
        thumbnailUploads: "presigned",
      },
    });
    syncServiceMocks.listHostedDevices.mockResolvedValue([{ id: "device-1" }]);
    syncServiceMocks.listAllRemoteTales.mockResolvedValue([]);
  });

  it("pauses background sync while the active profile is disabled", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listAllRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("pauses background sync before the profile is connected", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue(null);
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listAllRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("pauses hosted background sync when the access token is expired", async () => {
    syncStoreState.accessTokenExpiresAt = Date.now() - 1;
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listAllRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("resumes background sync when the active profile is enabled", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const disabledHarness = renderHarness();
    await disabledHarness.flush();
    disabledHarness.cleanup();

    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({ enabled: true });
    const enabledHarness = renderHarness();
    await enabledHarness.flush();

    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(1);

    enabledHarness.cleanup();
  });

  it("turns hosted sync off when the current device is not registered", async () => {
    syncServiceMocks.listHostedDevices.mockResolvedValueOnce([
      { id: "other-device" },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncRepoMocks.setSyncProfileDisabled).toHaveBeenCalledWith(
      "hosted",
      "device_limit",
    );
    expect(syncServiceMocks.listAllRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("uploads sync-preferred local tales that are not linked yet", async () => {
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-sync", policy: "sync", updatedAt: 1002 },
      { localTaleId: "local-private", policy: "private" },
    ]);
    const harness = renderHarness();

    try {
      await harness.flush();
      await waitForAssertion(() =>
        expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(1),
      );

      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(1);
      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledWith(
        expect.objectContaining({
          localTaleId: "local-sync",
          idempotencyKey:
            "upload-94f23e2a2052ee0e109b39fc53c376fad138d79929696b887177fb15acde5d1d",
        }),
      );
    } finally {
      harness.cleanup();
    }
  });

  it("deduplicates failure notifications until the initial-upload operation changes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const generation1002 = [
      { localTaleId: "local-sync", policy: "sync", updatedAt: 1002 },
    ];
    syncRepoMocks.listTaleSyncPreferences
      .mockResolvedValueOnce(generation1002)
      .mockResolvedValueOnce(generation1002)
      .mockResolvedValueOnce([
        { localTaleId: "local-sync", policy: "sync", updatedAt: 1003 },
      ]);
    syncServiceMocks.uploadTalePackage.mockRejectedValue(
      new Error("upload failed"),
    );
    const harness = renderHarness();

    try {
      await harness.flush();
      await waitForAssertion(() =>
        expect(toastMocks.error).toHaveBeenCalledTimes(1),
      );
      act(() => {
        wakeSyncBackground();
      });
      await harness.flush();
      await waitForAssertion(() =>
        expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(2),
      );

      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(2);
      expect(toastMocks.error).toHaveBeenCalledTimes(1);

      act(() => {
        wakeSyncBackground();
      });
      await harness.flush();
      await waitForAssertion(() =>
        expect(toastMocks.error).toHaveBeenCalledTimes(2),
      );

      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(3);
      expect(toastMocks.error).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it("recovers an interrupted initial upload by source tale id", async () => {
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-source", policy: "sync" },
    ]);
    syncServiceMocks.listAllRemoteTales.mockResolvedValue([
      {
        id: "generated-remote",
        sourceTaleId: "local-source",
        contentRev: 4,
        metadataRev: 2,
        title: "Remote",
      },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncRepoMocks.upsertTaleSyncState).toHaveBeenCalledWith({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-source",
      remoteTaleId: "generated-remote",
      contentRev: null,
      metadataRev: null,
      lastSyncedAt: null,
      pendingStatus: "error",
      lastErrorCode: "sync_failed",
    });
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledWith(
      expect.objectContaining({
        localTaleId: "local-source",
        remoteTale: expect.objectContaining({ id: "generated-remote" }),
      }),
    );

    harness.cleanup();
  });

  it("keeps a local copy private when its linked cloud tale was deleted", async () => {
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-1", policy: "sync" },
    ]);
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        accountId: "account-1",
        localTaleId: "local-1",
        remoteTaleId: "remote-deleted",
        pendingStatus: "idle",
      },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncRepoMocks.deleteTaleSyncState).toHaveBeenCalledWith({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-1",
    });
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-1",
      policy: "private",
    });
    expect(
      syncRepoMocks.setTaleSyncPreference.mock.invocationCallOrder[0],
    ).toBeLessThan(
      syncRepoMocks.deleteTaleSyncState.mock.invocationCallOrder[0],
    );

    harness.cleanup();
  });

  it("keeps the remote link when making the local copy private fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-1", policy: "sync" },
    ]);
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        accountId: "account-1",
        localTaleId: "local-1",
        remoteTaleId: "remote-deleted",
        pendingStatus: "idle",
      },
    ]);
    syncRepoMocks.setTaleSyncPreference.mockRejectedValueOnce(
      new Error("preference write failed"),
    );
    const harness = renderHarness();

    await harness.flush();

    expect(syncRepoMocks.deleteTaleSyncState).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    warn.mockRestore();
    harness.cleanup();
  });

  it("syncs linked local tales when their remote tale is listed", async () => {
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        pendingStatus: "push",
      },
    ]);
    syncServiceMocks.listAllRemoteTales.mockResolvedValue([
      { id: "remote-1", title: "Remote" },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledWith(
      expect.objectContaining({
        localTaleId: "local-1",
        remoteTale: expect.objectContaining({ id: "remote-1" }),
      }),
    );

    const { canPull } = syncServiceMocks.syncLinkedTale.mock.calls[0][0];
    useTaleStore.setState({ id: "other-tale", loadingTaleId: null });
    expect(canPull()).toBe(true);
    useTaleStore.setState({ loadingTaleId: "local-1" });
    expect(canPull()).toBe(false);
    useTaleStore.setState({ id: "local-1", loadingTaleId: null });
    expect(canPull()).toBe(false);

    harness.cleanup();
  });

  it("runs immediately when local work wakes sync", async () => {
    const harness = renderHarness();

    await harness.flush();
    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(1);

    act(() => {
      wakeSyncBackground();
    });
    await harness.flush();

    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(2);

    harness.cleanup();
  });

  it("notifies listeners after a background sync pass", async () => {
    const listener = vi.fn();
    const remove = addSyncChangedListener(listener);
    const harness = renderHarness();

    await harness.flush();

    expect(listener).toHaveBeenCalledOnce();

    remove();
    harness.cleanup();
  });

  it("runs one follow-up pass when sync is woken while already running", async () => {
    const remoteList = deferred<[]>();
    syncServiceMocks.listAllRemoteTales
      .mockReturnValueOnce(remoteList.promise)
      .mockResolvedValue([]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
    });
    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(1);

    act(() => {
      wakeSyncBackground();
    });
    remoteList.resolve([]);
    await harness.flush();

    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(2);

    harness.cleanup();
  });

  it("stops a suspended sync pass after sign-out", async () => {
    const remoteList = deferred<[]>();
    syncServiceMocks.listAllRemoteTales.mockReturnValueOnce(remoteList.promise);
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "private-after-logout", policy: "sync", updatedAt: 1 },
    ]);
    const harness = renderHarness();
    await harness.flush();
    syncStoreState.accessToken = "";
    syncStoreState.accountId = "";
    harness.rerender();
    remoteList.resolve([]);
    await harness.flush();

    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();
    expect(
      syncServiceMocks.createSyncTransport.mock.calls[0][0].signal?.aborted,
    ).toBe(true);
    harness.cleanup();
  });

  it("runs queued work with the new account instead of the old closure", async () => {
    const remoteList = deferred<[]>();
    syncServiceMocks.listAllRemoteTales.mockReturnValueOnce(remoteList.promise);
    const harness = renderHarness();
    await harness.flush();
    syncStoreState.accountId = "account-2";
    syncStoreState.accessToken = "account-2-token";
    syncStoreState.deviceId = "device-2";
    syncServiceMocks.listHostedDevices.mockResolvedValue([{ id: "device-2" }]);
    harness.rerender();
    remoteList.resolve([]);
    await harness.flush();

    expect(syncServiceMocks.createSyncTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          accountId: "account-2",
          deviceId: "device-2",
        }),
        accessToken: "account-2-token",
      }),
    );
    expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });
});
