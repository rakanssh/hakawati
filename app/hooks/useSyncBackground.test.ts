import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import {
  addSyncChangedListener,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import { SyncHttpError } from "@/services/sync";
import { useSyncBackground } from "./useSyncBackground";

i18n.load("en", {});
i18n.activate("en");

const syncRepoMocks = vi.hoisted(() => ({
  deleteTaleSyncState: vi.fn(),
  getSyncProfile: vi.fn(),
  listTaleSyncPreferences: vi.fn(),
  listTaleSyncStates: vi.fn(),
  retryCloudFullTaleSyncs: vi.fn(),
  setSyncProfileDisabled: vi.fn(),
  setTaleSyncPreference: vi.fn(),
  setTaleSyncStatus: vi.fn(),
  upsertTaleSyncState: vi.fn(),
}));

const openTaleMocks = vi.hoisted(() => ({
  isTaleInPlay: vi.fn(() => false),
  showPulledTale: vi.fn(),
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
  setCloudUpdateRequired: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sync")>()),
  ...syncServiceMocks,
}));
vi.mock("@/services/open-tale-sync", () => openTaleMocks);
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
    syncRepoMocks.retryCloudFullTaleSyncs.mockResolvedValue(undefined);
    syncRepoMocks.setTaleSyncStatus.mockResolvedValue(undefined);
    openTaleMocks.isTaleInPlay.mockReturnValue(false);
    syncServiceMocks.uploadTalePackage.mockResolvedValue(undefined);
    syncServiceMocks.syncLinkedTale.mockResolvedValue("skipped");
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

  it("turns sync off without registering again when this device was removed", async () => {
    syncServiceMocks.listHostedDevices.mockResolvedValueOnce([
      { id: "other-device" },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncRepoMocks.setSyncProfileDisabled).toHaveBeenCalledWith(
      "hosted",
      "user_disabled",
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

    // Open is not enough to hold a pull back; being played is.
    const { canPull } = syncServiceMocks.syncLinkedTale.mock.calls[0][0];
    expect(canPull()).toBe(true);
    openTaleMocks.isTaleInPlay.mockReturnValue(true);
    expect(canPull()).toBe(false);
    expect(openTaleMocks.isTaleInPlay).toHaveBeenLastCalledWith("local-1");

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
  it("shows the pulled version once the open tale takes a pull", async () => {
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        pendingStatus: "idle",
      },
      {
        profileId: "hosted",
        localTaleId: "local-2",
        remoteTaleId: "remote-2",
        pendingStatus: "idle",
      },
    ]);
    syncServiceMocks.listAllRemoteTales.mockResolvedValue([
      { id: "remote-1", title: "Pulled" },
      { id: "remote-2", title: "Unchanged" },
    ]);
    syncServiceMocks.syncLinkedTale.mockImplementation(
      async ({ localTaleId }: { localTaleId: string }) =>
        localTaleId === "local-1" ? "pulled" : "skipped",
    );
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(openTaleMocks.showPulledTale).toHaveBeenCalledWith("local-1"),
      );
      expect(openTaleMocks.showPulledTale).toHaveBeenCalledOnce();
    } finally {
      harness.cleanup();
    }
  });

  it("unlinks a tale opened from the cloud once its cloud copy is removed", async () => {
    // Tales opened from the cloud and kept copies have no sync preference.
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        accountId: "account-1",
        localTaleId: "opened-from-cloud",
        remoteTaleId: "remote-removed",
        pendingStatus: "idle",
      },
    ]);
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(syncRepoMocks.deleteTaleSyncState).toHaveBeenCalledWith({
          profileId: "hosted",
          accountId: "account-1",
          localTaleId: "opened-from-cloud",
        }),
      );
      expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
        profileId: "hosted",
        accountId: "account-1",
        localTaleId: "opened-from-cloud",
        policy: "private",
      });
      expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });

  it("tells the player to update when the cloud refuses this app version", async () => {
    syncServiceMocks.assertSyncAvailable.mockImplementationOnce(() => {
      throw new SyncHttpError(
        "Update Hakawati to sync.",
        426,
        "unsupported_client",
      );
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(syncStoreState.setCloudUpdateRequired).toHaveBeenCalledWith(
          true,
        ),
      );
      expect(syncServiceMocks.listAllRemoteTales).not.toHaveBeenCalled();

      act(() => {
        wakeSyncBackground();
      });
      await waitForAssertion(() =>
        expect(syncStoreState.setCloudUpdateRequired).toHaveBeenLastCalledWith(
          false,
        ),
      );
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it("stops the pass when a write is refused for this app version", async () => {
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-new", policy: "sync", updatedAt: 1 },
    ]);
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
    syncServiceMocks.uploadTalePackage.mockRejectedValue(
      new SyncHttpError("Too old", 426, "unsupported_client"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(syncStoreState.setCloudUpdateRequired).toHaveBeenLastCalledWith(
          true,
        ),
      );
      expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();
      expect(toastMocks.error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it("waits for cloud space before uploading new tales again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-a", policy: "sync", updatedAt: 1 },
      { localTaleId: "local-b", policy: "sync", updatedAt: 1 },
    ]);
    const others = [
      { id: "other-1", sourceTaleId: "other-1" },
      { id: "other-2", sourceTaleId: "other-2" },
    ];
    syncServiceMocks.listAllRemoteTales.mockResolvedValue(others);
    syncServiceMocks.uploadTalePackage.mockRejectedValue(
      new SyncHttpError("Quota exceeded.", 409, "quota_exceeded"),
    );
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(toastMocks.error).toHaveBeenCalledWith("Cloud storage is full"),
      );
      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledOnce();

      act(() => {
        wakeSyncBackground();
      });
      await waitForAssertion(() =>
        expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(2),
      );
      await harness.flush();
      expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledOnce();
      expect(toastMocks.error).toHaveBeenCalledOnce();

      // A tale left the cloud, so there may be room again.
      syncServiceMocks.listAllRemoteTales.mockResolvedValue(others.slice(1));
      act(() => {
        wakeSyncBackground();
      });
      await waitForAssertion(() =>
        expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(2),
      );
      expect(syncRepoMocks.retryCloudFullTaleSyncs).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it("holds a linked tale's changes while the cloud is full", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    syncServiceMocks.syncLinkedTale.mockRejectedValueOnce(
      new SyncHttpError("Quota exceeded.", 409, "quota_exceeded"),
    );
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(toastMocks.error).toHaveBeenCalledWith("Cloud storage is full"),
      );
      expect(syncRepoMocks.setTaleSyncStatus).not.toHaveBeenCalled();

      act(() => {
        wakeSyncBackground();
      });
      await waitForAssertion(() =>
        expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledTimes(2),
      );
      // Its next change is held as refused rather than uploaded into a full cloud.
      expect(syncRepoMocks.setTaleSyncStatus).toHaveBeenCalledWith({
        profileId: "hosted",
        accountId: "account-1",
        localTaleId: "local-1",
        pendingStatus: "error",
        lastErrorCode: "quota_exceeded",
      });
      expect(
        syncRepoMocks.setTaleSyncStatus.mock.invocationCallOrder[0],
      ).toBeLessThan(
        syncServiceMocks.syncLinkedTale.mock.invocationCallOrder[1],
      );
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it("tries tales refused for a full cloud once per session, one at a time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Both were refused in an earlier session.
    syncRepoMocks.listTaleSyncStates.mockResolvedValue(
      ["local-1", "local-2"].map((localTaleId, index) => ({
        profileId: "hosted",
        localTaleId,
        remoteTaleId: `remote-${index + 1}`,
        pendingStatus: "error",
        lastErrorCode: "quota_exceeded",
      })),
    );
    syncServiceMocks.listAllRemoteTales.mockResolvedValue([
      { id: "remote-1", title: "One" },
      { id: "remote-2", title: "Two" },
    ]);
    syncServiceMocks.syncLinkedTale.mockRejectedValueOnce(
      new SyncHttpError("Quota exceeded.", 409, "quota_exceeded"),
    );
    const harness = renderHarness();

    try {
      await waitForAssertion(() =>
        expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledTimes(2),
      );
      expect(syncRepoMocks.retryCloudFullTaleSyncs).toHaveBeenCalledOnce();
      // The first refusal holds the second tale instead of uploading it too.
      expect(syncRepoMocks.setTaleSyncStatus).toHaveBeenCalledOnce();
      expect(syncRepoMocks.setTaleSyncStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          localTaleId: "local-2",
          pendingStatus: "error",
          lastErrorCode: "quota_exceeded",
        }),
      );

      act(() => {
        wakeSyncBackground();
      });
      await waitForAssertion(() =>
        expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledTimes(4),
      );
      expect(syncRepoMocks.retryCloudFullTaleSyncs).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });

  it.each([
    [413, "package_too_large"],
    // The create's key went to a tale that was removed since.
    [409, "idempotency_conflict"],
  ])(
    "does not upload a tale the cloud refused with %s %s again",
    async (status, code) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
        { localTaleId: "local-huge", policy: "sync", updatedAt: 1 },
      ]);
      syncServiceMocks.uploadTalePackage.mockRejectedValue(
        new SyncHttpError("Refused", status, code),
      );
      const harness = renderHarness();

      try {
        await waitForAssertion(() =>
          expect(toastMocks.error).toHaveBeenCalledWith(
            "Failed to upload tale to cloud",
          ),
        );
        act(() => {
          wakeSyncBackground();
        });
        await waitForAssertion(() =>
          expect(syncServiceMocks.listAllRemoteTales).toHaveBeenCalledTimes(2),
        );
        await harness.flush();
        expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledOnce();
      } finally {
        warn.mockRestore();
        harness.cleanup();
      }
    },
  );
});
