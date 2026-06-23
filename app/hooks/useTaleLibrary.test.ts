import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSyncWakeListener, notifySyncChanged } from "@/services/sync-wakeup";
import type { TaleHead } from "@/types/tale.type";
import { useTaleLibrary } from "./useTaleLibrary";

const taleHookMocks = vi.hoisted(() => ({
  useTalesList: vi.fn(),
}));

const gameSaveMocks = vi.hoisted(() => ({
  load: vi.fn(),
}));

const syncRepoMocks = vi.hoisted(() => ({
  deleteTaleSyncState: vi.fn(),
  getSyncProfile: vi.fn(),
  listTaleSyncStates: vi.fn(),
  setTaleSyncPreference: vi.fn(),
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
    applyRemoteTalePackage: vi.fn(),
    createSyncTransport: vi.fn(() => ({})),
    deleteRemoteTale: vi.fn(),
    importRemoteTalePackage: vi.fn(),
    keepBothTalePackage: vi.fn(),
    listAllRemoteTales,
    listRemoteTales,
    replaceRemoteTalePackage: vi.fn(),
    SyncHttpError: class SyncHttpError extends Error {
      constructor(
        message: string,
        readonly status: number,
        readonly code = String(status),
      ) {
        super(message);
      }
    },
  };
});

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  personalBaseUrl: "",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "token",
  accessTokenExpiresAt: null as number | null,
  deviceId: "device-1",
}));

vi.mock("@/hooks/useTales", () => taleHookMocks);

vi.mock("@/hooks/useGameSaves", () => ({
  useLoadTale: () => ({ load: gameSaveMocks.load }),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);

vi.mock("@/services/sync", () => syncServiceMocks);

vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));

function renderHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof useTaleLibrary> | undefined;

  function Harness() {
    controls = useTaleLibrary(1, 6);
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get controls() {
      if (!controls) throw new Error("Harness did not render.");
      return controls;
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useTaleLibrary", () => {
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
    });
    taleHookMocks.useTalesList.mockReturnValue({
      items: [localTale("local-1")],
      page: 1,
      limit: 6,
      total: 1,
      setPage: vi.fn(),
      setLimit: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
      loadIntoGame: vi.fn(),
      deleteTale: vi.fn(),
      saveAsScenario: vi.fn(),
    });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([]);
    syncRepoMocks.setTaleSyncPreference.mockResolvedValue(undefined);
    syncRepoMocks.deleteTaleSyncState.mockResolvedValue(undefined);
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  it("keeps local tales visible when remote listing fails", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales.mockRejectedValue(new Error("offline"));
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);
    expect(harness.controls.remoteError).toBeInstanceOf(Error);

    harness.cleanup();
  });

  it("does not fetch remote tales while the profile is disabled", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "user_disabled",
    });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(syncRepoMocks.listTaleSyncStates).not.toHaveBeenCalled();
    expect(harness.controls.syncActive).toBe(false);
    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);
    expect(harness.controls.items[0]).not.toHaveProperty("sync");

    harness.cleanup();
  });

  it("does not fetch remote tales before the profile is connected", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue(null);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(syncRepoMocks.listTaleSyncStates).not.toHaveBeenCalled();
    expect(harness.controls.syncActive).toBe(false);
    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);

    harness.cleanup();
  });

  it("keeps local tales visible and skips remote fetches with expired hosted auth", async () => {
    syncStoreState.accessTokenExpiresAt = Date.now() - 1;
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);

    harness.cleanup();
  });

  it("ignores local sync metadata when cloud cannot be reached", async () => {
    syncStoreState.accessToken = "";
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncRepoMocks.listTaleSyncStates).not.toHaveBeenCalled();
    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();
    expect(harness.controls.syncActive).toBe(false);
    expect(harness.controls.items[0]).not.toHaveProperty("sync");

    harness.cleanup();
  });

  it("resumes remote fetching when the profile is enabled again", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const disabledHarness = renderHarness();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    disabledHarness.cleanup();

    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({ enabled: true });
    const enabledHarness = renderHarness();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);
    expect(enabledHarness.controls.syncActive).toBe(true);
    enabledHarness.cleanup();
  });

  it("rechecks profile enabled state when sync changes without remounting", async () => {
    syncRepoMocks.getSyncProfile
      .mockResolvedValueOnce({
        enabled: false,
        disabledReason: "user_disabled",
      })
      .mockResolvedValueOnce({ enabled: true });
    const harness = renderHarness();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncServiceMocks.listRemoteTales).not.toHaveBeenCalled();

    act(() => {
      notifySyncChanged();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);
    harness.cleanup();
  });

  it("includes remote tales from later remote pages", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales
      .mockResolvedValueOnce({
        items: [remoteTale("remote-1")],
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        items: [remoteTale("remote-2")],
        nextCursor: null,
      });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.controls.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "remote",
          remoteTale: expect.objectContaining({ id: "remote-1" }),
        }),
        expect.objectContaining({
          source: "remote",
          remoteTale: expect.objectContaining({ id: "remote-2" }),
        }),
      ]),
    );

    harness.cleanup();
  });

  it("keeps local tales visible while the first remote list is loading", async () => {
    let resolveRemote!: (page: {
      items: unknown[];
      nextCursor: string | null;
    }) => void;
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales.mockReturnValue(
      new Promise((resolve) => {
        resolveRemote = resolve;
      }),
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.controls.loading).toBe(false);
    expect(harness.controls.syncListLoading).toBe(true);
    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);

    await act(async () => {
      resolveRemote({ items: [], nextCursor: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.controls.loading).toBe(false);
    expect(harness.controls.items).toMatchObject([
      { source: "local", localTale: { id: "local-1" } },
    ]);
    expect(harness.controls.syncActive).toBe(true);

    harness.cleanup();
  });

  it("downloads and loads a remote-only tale before play", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [remoteTale("remote-1")],
      nextCursor: null,
    });
    syncServiceMocks.importRemoteTalePackage.mockResolvedValueOnce(
      "local-imported",
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const item = harness.controls.items.find(
      (candidate) => candidate.source === "remote",
    );
    if (!item) throw new Error("Remote item did not render");
    await act(async () => {
      await harness.controls.loadIntoGame(item);
    });

    expect(syncServiceMocks.importRemoteTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaleId: "remote-1",
      }),
    );
    expect(gameSaveMocks.load).toHaveBeenCalledWith("local-imported");

    harness.cleanup();
  });

  it("refreshes the library after background sync changes state", async () => {
    const localRefresh = vi.fn();
    taleHookMocks.useTalesList.mockReturnValue({
      items: [localTale("local-1")],
      page: 1,
      limit: 6,
      total: 1,
      setPage: vi.fn(),
      setLimit: vi.fn(),
      loading: false,
      error: null,
      refresh: localRefresh,
      loadIntoGame: vi.fn(),
      deleteTale: vi.fn(),
      saveAsScenario: vi.fn(),
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(1);

    act(() => {
      notifySyncChanged();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localRefresh).toHaveBeenCalledOnce();
    expect(syncServiceMocks.listRemoteTales).toHaveBeenCalledTimes(2);

    harness.cleanup();
  });

  it("resolves a linked tale conflict by keeping the local tale", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "conflict",
        lastErrorCode: "remote_changed",
      },
    ]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const item = harness.controls.items[0];
    let resolvedId = "";
    await act(async () => {
      resolvedId = await harness.controls.resolveConflict(item, "keep-local");
    });

    expect(syncServiceMocks.replaceRemoteTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        localTaleId: "local-1",
        idempotencyKey: expect.stringMatching(/^conflict-local-1-/),
        forceReplace: true,
      }),
    );
    expect(resolvedId).toBe("local-1");

    harness.cleanup();
  });

  it.each([
    [
      "keep-remote" as const,
      syncServiceMocks.applyRemoteTalePackage,
      "local-1",
    ],
    ["keep-both" as const, syncServiceMocks.keepBothTalePackage, "copy-1"],
  ])(
    "resolves a linked tale conflict with %s",
    async (choice, expectedCall, expectedResolvedId) => {
      syncServiceMocks.keepBothTalePackage.mockResolvedValue("copy-1");
      syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
      syncRepoMocks.listTaleSyncStates.mockResolvedValue([
        {
          profileId: "hosted",
          localTaleId: "local-1",
          remoteTaleId: "remote-1",
          contentRev: "2",
          metadataRev: "3",
          lastSyncedAt: 1,
          pendingStatus: "conflict",
          lastErrorCode: "remote_changed",
        },
      ]);
      const harness = renderHarness();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      let resolvedId = "";
      await act(async () => {
        resolvedId = await harness.controls.resolveConflict(
          harness.controls.items[0],
          choice,
        );
      });

      expect(expectedCall).toHaveBeenCalledWith(
        expect.objectContaining({
          localTaleId: "local-1",
        }),
      );
      expect(resolvedId).toBe(expectedResolvedId);

      harness.cleanup();
    },
  );

  it("deletes a remote-only tale through the active sync profile", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [remoteTale("remote-1")],
      nextCursor: null,
    });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const item = harness.controls.items.find(
      (candidate) => candidate.source === "remote",
    );
    if (!item) throw new Error("Remote item did not render");
    await act(async () => {
      await harness.controls.deleteLibraryTale(item);
    });

    expect(syncServiceMocks.deleteRemoteTale).toHaveBeenCalledWith(
      {},
      "remote-1",
      1,
    );

    harness.cleanup();
  });

  it("attempts cloud delete when deleting a linked local tale", async () => {
    const localDelete = vi.fn();
    taleHookMocks.useTalesList.mockReturnValue({
      items: [localTale("local-1")],
      page: 1,
      limit: 6,
      total: 1,
      setPage: vi.fn(),
      setLimit: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
      loadIntoGame: vi.fn(),
      deleteTale: localDelete,
      saveAsScenario: vi.fn(),
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.deleteLibraryTale(harness.controls.items[0]);
    });

    expect(syncServiceMocks.deleteRemoteTale).toHaveBeenCalledWith(
      {},
      "remote-1",
      3,
    );
    expect(localDelete).toHaveBeenCalledWith("local-1");

    harness.cleanup();
  });

  it("queues a local tale for cloud sync", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    const wakeListener = vi.fn();
    const removeWakeListener = addSyncWakeListener(wakeListener);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.syncLibraryTale(harness.controls.items[0]);
    });

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "sync",
    });
    expect(wakeListener).toHaveBeenCalledOnce();

    removeWakeListener();
    harness.cleanup();
  });

  it("removes a linked local tale from cloud and keeps it private", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.removeLibraryTaleFromCloud(
        harness.controls.items[0],
      );
    });

    expect(syncServiceMocks.deleteRemoteTale).toHaveBeenCalledWith(
      {},
      "remote-1",
      3,
    );
    expect(syncRepoMocks.deleteTaleSyncState).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
    });
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });

    harness.cleanup();
  });

  it("imports a remote-only tale before removing it from cloud", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncServiceMocks.listRemoteTales.mockResolvedValue({
      items: [remoteTale("remote-1")],
      nextCursor: null,
    });
    syncServiceMocks.importRemoteTalePackage.mockResolvedValueOnce(
      "local-imported",
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const item = harness.controls.items.find(
      (candidate) => candidate.source === "remote",
    );
    if (!item) throw new Error("Remote item did not render");
    await act(async () => {
      await harness.controls.removeLibraryTaleFromCloud(item);
    });

    expect(syncServiceMocks.importRemoteTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaleId: "remote-1",
      }),
    );
    expect(syncServiceMocks.deleteRemoteTale).toHaveBeenCalledWith(
      {},
      "remote-1",
      1,
    );
    expect(syncRepoMocks.deleteTaleSyncState).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-imported",
    });
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-imported",
      policy: "private",
    });

    harness.cleanup();
  });

  it("finishes local unlink when removing a cloud tale that is already gone", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    syncServiceMocks.deleteRemoteTale.mockRejectedValueOnce(
      new syncServiceMocks.SyncHttpError("Not found", 404),
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.removeLibraryTaleFromCloud(
        harness.controls.items[0],
      );
    });

    expect(syncRepoMocks.deleteTaleSyncState).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
    });
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });

    harness.cleanup();
  });

  it("does not unlink a cloud tale when remote removal fails", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    syncServiceMocks.deleteRemoteTale.mockRejectedValueOnce(
      new Error("offline"),
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(
      act(async () => {
        await harness.controls.removeLibraryTaleFromCloud(
          harness.controls.items[0],
        );
      }),
    ).rejects.toThrow("offline");

    expect(syncRepoMocks.deleteTaleSyncState).not.toHaveBeenCalled();
    expect(syncRepoMocks.setTaleSyncPreference).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("skips cloud delete when sync is disabled", async () => {
    const localDelete = vi.fn();
    taleHookMocks.useTalesList.mockReturnValue({
      items: [localTale("local-1")],
      page: 1,
      limit: 6,
      total: 1,
      setPage: vi.fn(),
      setLimit: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
      loadIntoGame: vi.fn(),
      deleteTale: localDelete,
      saveAsScenario: vi.fn(),
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "user_disabled",
    });
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.deleteLibraryTale({
        source: "local",
        localTale: localTale("local-1"),
        sync: {
          profileId: "hosted",
          remoteTaleId: "remote-1",
          metadataRev: "3",
          status: "idle",
          lastErrorCode: null,
        },
      });
    });

    expect(syncServiceMocks.deleteRemoteTale).not.toHaveBeenCalled();
    expect(localDelete).toHaveBeenCalledWith("local-1");

    harness.cleanup();
  });

  it("does not let remote delete failure block linked local tale deletion", async () => {
    const localDelete = vi.fn();
    taleHookMocks.useTalesList.mockReturnValue({
      items: [localTale("local-1")],
      page: 1,
      limit: 6,
      total: 1,
      setPage: vi.fn(),
      setLimit: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
      loadIntoGame: vi.fn(),
      deleteTale: localDelete,
      saveAsScenario: vi.fn(),
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([
      {
        profileId: "hosted",
        localTaleId: "local-1",
        remoteTaleId: "remote-1",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
    ]);
    syncServiceMocks.deleteRemoteTale.mockRejectedValueOnce(
      new Error("offline"),
    );
    const harness = renderHarness();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await harness.controls.deleteLibraryTale(harness.controls.items[0]);
    });

    expect(syncServiceMocks.deleteRemoteTale).toHaveBeenCalledWith(
      {},
      "remote-1",
      3,
    );
    expect(localDelete).toHaveBeenCalledWith("local-1");

    harness.cleanup();
  });
});

function localTale(id: string): TaleHead {
  return {
    id,
    name: "Local",
    description: "",
    thumbnail: null,
    createdAt: 1,
    scenarioId: null,
    logCount: 1,
    updatedAt: 1,
    lastLogEntry: null,
    scenarioHead: null,
  };
}

function remoteTale(id: string) {
  return {
    id,
    title: "Remote",
    description: "Cloud tale",
    gameMode: "story_teller",
    coverAssetId: null,
    thumbnailAssetId: null,
    contentRev: 1,
    metadataRev: 1,
    turnCount: 1,
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastEntryPreview: "Cloud preview",
  };
}
