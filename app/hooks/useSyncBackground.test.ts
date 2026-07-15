import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSyncChangedListener,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import { useSyncBackground } from "./useSyncBackground";

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
  const listRemoteTales = vi.fn();
  const listAllRemoteTales = vi.fn(async (transport, limit = 100) => {
    const items: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = (await listRemoteTales(transport, {
        cursor,
        limit,
      })) as { items: unknown[]; nextCursor: string | null };
      items.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return items;
  });
  return {
    assertSyncAvailable: vi.fn(),
    createSyncTransport: vi.fn(() => ({ transport: true })),
    fetchSyncCapabilities: vi.fn(),
    listAllRemoteTales,
    listHostedDevices: vi.fn(),
    listRemoteTales,
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

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", () => syncServiceMocks);
vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));

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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
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
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  it("pauses background sync while the active profile is disabled", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("pauses background sync before the profile is connected", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue(null);
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();
    expect(syncServiceMocks.syncLinkedTale).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("pauses hosted background sync when the access token is expired", async () => {
    syncStoreState.accessTokenExpiresAt = Date.now() - 1;
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
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

    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);

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
    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(syncServiceMocks.uploadTalePackage).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("uploads sync-preferred local tales that are not linked yet", async () => {
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([
      { localTaleId: "local-sync", policy: "sync" },
      { localTaleId: "local-private", policy: "private" },
    ]);
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledTimes(1);
    expect(syncServiceMocks.uploadTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({ localTaleId: "local-sync" }),
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
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [{ id: "remote-1", title: "Remote" }],
      nextCursor: null,
    });
    const harness = renderHarness();

    await harness.flush();

    expect(syncServiceMocks.syncLinkedTale).toHaveBeenCalledWith(
      expect.objectContaining({
        localTaleId: "local-1",
        remoteTale: expect.objectContaining({ id: "remote-1" }),
      }),
    );

    harness.cleanup();
  });

  it("runs immediately when local work wakes sync", async () => {
    const harness = renderHarness();

    await harness.flush();
    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);

    act(() => {
      wakeSyncBackground();
    });
    await harness.flush();

    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(2);

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
    const remoteList = deferred<{ items: []; nextCursor: null }>();
    syncServiceMocks.listRemoteTales
      .mockReturnValueOnce(remoteList.promise)
      .mockResolvedValue({ items: [], nextCursor: null });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
    });
    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);

    act(() => {
      wakeSyncBackground();
    });
    remoteList.resolve({ items: [], nextCursor: null });
    await harness.flush();

    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(2);

    harness.cleanup();
  });
});
