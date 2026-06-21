import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryRole, type LogEntry } from "@/types/log.type";

const taleStoreMocks = vi.hoisted(() => {
  type MockTaleState = {
    id: string;
    name: string;
    description: string;
    components: unknown[];
    storyCards: unknown[];
    stats: unknown[];
    inventory: unknown[];
    log: LogEntry[];
    gameMode: string;
    undoStack: LogEntry[];
    totalLogCount: number;
    oldestLoadedIndex: number;
    logWindowSize: number;
    isLoadingOlderEntries: boolean;
  };

  function createState(): MockTaleState {
    return {
      id: "",
      name: "",
      description: "",
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      log: [],
      gameMode: "story_teller",
      undoStack: [],
      totalLogCount: 0,
      oldestLoadedIndex: 0,
      logWindowSize: 200,
      isLoadingOlderEntries: false,
    };
  }

  const state = createState();

  function setState(patch: Partial<MockTaleState>) {
    Object.assign(state, patch);
  }

  function reset(patch: Partial<MockTaleState> = {}) {
    Object.assign(state, createState(), patch);
  }

  const useTaleStore = Object.assign(
    (selector?: (current: MockTaleState) => unknown) =>
      selector ? selector(state) : state,
    {
      getState: () => state,
      setState,
    },
  );

  return { state, reset, useTaleStore };
});

const lastPlayedMocks = vi.hoisted(() => ({
  setLastPlayedTaleId: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  completePendingTaleTurn: vi.fn(),
  commitTaleTurn: vi.fn(),
  editTaleLogEntry: vi.fn(),
  getTaleById: vi.fn(),
  persistCurrentTale: vi.fn(),
  redoTaleLogEntry: vi.fn(),
  retryTaleLogEntry: vi.fn(),
  retryTaleTurn: vi.fn(),
  undoTaleLogToEntryCount: vi.fn(),
}));

const syncRepoMocks = vi.hoisted(() => ({
  listSyncStatesForLocalTale: vi.fn(),
  setTaleSyncStatus: vi.fn(),
}));

const syncWakeMocks = vi.hoisted(() => ({
  wakeSyncBackground: vi.fn(),
}));

vi.mock("@/store/useTaleStore", () => ({
  DEFAULT_WINDOW_SIZE: 200,
  useTaleStore: taleStoreMocks.useTaleStore,
}));

vi.mock("@/store/useLastPlayedStore", () => ({
  useLastPlayedStore: {
    getState: () => ({
      setLastPlayedTaleId: lastPlayedMocks.setLastPlayedTaleId,
    }),
  },
}));

vi.mock("@/services/tale.service", () => serviceMocks);

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync-wakeup", () => syncWakeMocks);

import { useLoadTale, usePersistTale } from "./useGameSaves";

function renderLoadHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof useLoadTale> | undefined;

  function Harness() {
    controls = useLoadTale();
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

function renderPersistHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof usePersistTale> | undefined;

  function Harness() {
    controls = usePersistTale();
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

function createLoadedTale(id: string, entryId: string) {
  return {
    id,
    name: "Loaded tale",
    description: "",
    components: [],
    storyCards: [],
    stats: [],
    inventory: [],
    log: [
      {
        id: entryId,
        role: LogEntryRole.GM,
        text: "Loaded log entry.",
      },
    ],
    gameMode: GameMode.STORY_TELLER,
    undoStack: [],
    totalLogCount: 1,
    oldestLoadedIndex: 0,
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

describe("useLoadTale", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    taleStoreMocks.reset({
      id: "old-tale",
      name: "Old tale",
      description: "Existing state",
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      log: [
        {
          id: "old-entry",
          role: LogEntryRole.GM,
          text: "Existing log entry.",
        },
      ],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [],
      totalLogCount: 1,
      oldestLoadedIndex: 0,
      logWindowSize: 200,
      isLoadingOlderEntries: false,
    });
  });

  it("does not reset the current log window when a load fails", async () => {
    serviceMocks.getTaleById.mockRejectedValueOnce(new Error("Tale not found"));
    const harness = renderLoadHarness();

    await expect(
      act(async () => {
        await harness.controls.load("missing-tale");
      }),
    ).rejects.toThrow("Tale not found");

    expect(taleStoreMocks.state.log.map((entry) => entry.id)).toEqual([
      "old-entry",
    ]);
    expect(taleStoreMocks.state.totalLogCount).toBe(1);
    expect(taleStoreMocks.state.id).toBe("old-tale");
    expect(lastPlayedMocks.setLastPlayedTaleId).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("does not reset the current log window while a superseded load is pending", async () => {
    const staleLoad = deferred<ReturnType<typeof createLoadedTale>>();
    serviceMocks.getTaleById
      .mockReturnValueOnce(staleLoad.promise)
      .mockResolvedValueOnce(createLoadedTale("fresh-tale", "fresh-entry"));
    const harness = renderLoadHarness();

    let staleLoadPromise: Promise<void> = Promise.resolve();
    act(() => {
      staleLoadPromise = harness.controls.load("stale-tale");
    });

    expect(taleStoreMocks.state.log.map((entry) => entry.id)).toEqual([
      "old-entry",
    ]);
    expect(taleStoreMocks.state.totalLogCount).toBe(1);

    await act(async () => {
      await harness.controls.load("fresh-tale");
    });

    expect(taleStoreMocks.state.id).toBe("fresh-tale");
    expect(taleStoreMocks.state.log.map((entry) => entry.id)).toEqual([
      "fresh-entry",
    ]);
    expect(taleStoreMocks.state.totalLogCount).toBe(1);

    staleLoad.resolve(createLoadedTale("stale-tale", "stale-entry"));
    await act(async () => {
      await staleLoadPromise;
    });

    expect(taleStoreMocks.state.id).toBe("fresh-tale");
    expect(taleStoreMocks.state.log.map((entry) => entry.id)).toEqual([
      "fresh-entry",
    ]);
    expect(taleStoreMocks.state.totalLogCount).toBe(1);

    harness.cleanup();
  });
});

describe("usePersistTale", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    taleStoreMocks.reset({
      id: "tale-1",
      name: "Linked tale",
      description: "",
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      log: [],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [],
    });
  });

  it("marks linked tales for push after local turn save succeeds", async () => {
    serviceMocks.commitTaleTurn.mockResolvedValueOnce(undefined);
    syncRepoMocks.listSyncStatesForLocalTale.mockResolvedValueOnce([
      {
        profileId: "hosted",
        localTaleId: "tale-1",
        remoteTaleId: "remote-1",
        contentRev: "1",
        metadataRev: "1",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      },
      {
        profileId: "personal",
        localTaleId: "tale-1",
        remoteTaleId: "remote-2",
        contentRev: "1",
        metadataRev: "1",
        lastSyncedAt: 1,
        pendingStatus: "conflict",
        lastErrorCode: "content_conflict",
      },
    ]);
    const harness = renderPersistHarness();

    await act(async () => {
      await harness.controls.saveTurn(
        "tale-1",
        [{ id: "entry-1", role: LogEntryRole.PLAYER, text: "Go" }],
        123,
      );
    });

    expect(serviceMocks.commitTaleTurn).toHaveBeenCalledOnce();
    expect(syncRepoMocks.setTaleSyncStatus).toHaveBeenCalledOnce();
    expect(syncRepoMocks.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "tale-1",
      pendingStatus: "push",
      lastErrorCode: null,
    });
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalledOnce();

    harness.cleanup();
  });
});
