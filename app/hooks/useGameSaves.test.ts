import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryRole } from "@/types/log.type";
import { useTaleStore } from "@/store/useTaleStore";

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

const syncWakeMocks = vi.hoisted(() => ({
  wakeSyncBackground: vi.fn(),
}));

vi.mock("@/repositories/tale.repository", () => ({ getLogEntries: vi.fn() }));
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

vi.mock("@/store/useLastPlayedStore", () => ({
  useLastPlayedStore: {
    getState: () => ({
      setLastPlayedTaleId: lastPlayedMocks.setLastPlayedTaleId,
    }),
  },
}));

vi.mock("@/services/tale.service", () => serviceMocks);

vi.mock("@/services/sync-wakeup", () => syncWakeMocks);

import { useLoadTale, usePersistTale } from "./useGameSaves";

function renderHarness<T>(useHook: () => T) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: T | undefined;

  function Harness() {
    controls = useHook();
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
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("useLoadTale", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "old-tale",
      name: "Old tale",
      description: "Existing state",
      log: [
        {
          id: "old-entry",
          role: LogEntryRole.GM,
          text: "Existing log entry.",
        },
      ],
      totalLogCount: 1,
      isLoadingOlderEntries: false,
    });
  });

  it("does not reset the current log window when a load fails", async () => {
    serviceMocks.getTaleById.mockRejectedValueOnce(new Error("Tale not found"));
    const harness = renderHarness(useLoadTale);

    await expect(
      act(async () => {
        await harness.controls.load("missing-tale");
      }),
    ).rejects.toThrow("Tale not found");

    expect(useTaleStore.getState().log.map((entry) => entry.id)).toEqual([
      "old-entry",
    ]);
    expect(useTaleStore.getState().totalLogCount).toBe(1);
    expect(useTaleStore.getState().id).toBe("old-tale");
    expect(useTaleStore.getState().loadingTaleId).toBeNull();
    expect(lastPlayedMocks.setLastPlayedTaleId).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it.each([false, true])(
    "ignores a superseded load across hook instances: %s",
    async (separateHook) => {
      const staleLoad = deferred<ReturnType<typeof createLoadedTale>>();
      serviceMocks.getTaleById
        .mockReturnValueOnce(staleLoad.promise)
        .mockResolvedValueOnce(createLoadedTale("fresh-tale", "fresh-entry"));
      const harness = renderHarness(useLoadTale);
      const nextHarness = separateHook ? renderHarness(useLoadTale) : harness;

      let staleLoadPromise: Promise<void> = Promise.resolve();
      act(() => {
        staleLoadPromise = harness.controls.load("stale-tale");
      });
      expect(useTaleStore.getState().loadingTaleId).toBe("stale-tale");

      expect(useTaleStore.getState().log.map((entry) => entry.id)).toEqual([
        "old-entry",
      ]);
      expect(useTaleStore.getState().totalLogCount).toBe(1);

      await act(async () => {
        await nextHarness.controls.load("fresh-tale");
      });

      expect(useTaleStore.getState().id).toBe("fresh-tale");
      expect(useTaleStore.getState().loadingTaleId).toBeNull();
      expect(useTaleStore.getState().log.map((entry) => entry.id)).toEqual([
        "fresh-entry",
      ]);
      expect(useTaleStore.getState().totalLogCount).toBe(1);

      staleLoad.resolve(createLoadedTale("stale-tale", "stale-entry"));
      await act(async () => {
        await staleLoadPromise;
      });

      expect(useTaleStore.getState().id).toBe("fresh-tale");
      expect(useTaleStore.getState().log.map((entry) => entry.id)).toEqual([
        "fresh-entry",
      ]);
      expect(useTaleStore.getState().totalLogCount).toBe(1);

      harness.cleanup();
      if (separateHook) nextHarness.cleanup();
    },
  );

  it("ignores the first A request when switching A to B and back to A", async () => {
    const firstA = deferred<ReturnType<typeof createLoadedTale>>();
    const loadB = deferred<ReturnType<typeof createLoadedTale>>();
    const latestA = deferred<ReturnType<typeof createLoadedTale>>();
    serviceMocks.getTaleById
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(loadB.promise)
      .mockReturnValueOnce(latestA.promise);
    const harness = renderHarness(useLoadTale);
    let requests: Promise<void>[] = [];
    act(() => {
      requests = [
        harness.controls.load("A"),
        harness.controls.load("B"),
        harness.controls.load("A"),
      ];
    });
    firstA.resolve(createLoadedTale("A", "stale-A"));
    await act(async () => {
      await requests[0];
    });
    expect(useTaleStore.getState().id).toBe("old-tale");
    expect(harness.controls.loading).toBe(true);
    latestA.resolve(createLoadedTale("A", "latest-A"));
    loadB.resolve(createLoadedTale("B", "stale-B"));
    await act(async () => {
      await Promise.all(requests);
    });
    expect(useTaleStore.getState().log[0].id).toBe("latest-A");
    expect(harness.controls.loading).toBe(false);
    harness.cleanup();
  });

  it("does not replace the game state after its load hook unmounts", async () => {
    const pending = deferred<ReturnType<typeof createLoadedTale>>();
    serviceMocks.getTaleById.mockReturnValueOnce(pending.promise);
    const harness = renderHarness(useLoadTale);
    let request!: Promise<void>;
    act(() => {
      request = harness.controls.load("A");
    });
    harness.cleanup();
    pending.resolve(createLoadedTale("A", "unmounted"));
    await request;
    expect(useTaleStore.getState().id).toBe("old-tale");
    expect(lastPlayedMocks.setLastPlayedTaleId).not.toHaveBeenCalled();
  });
});

describe("usePersistTale", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "tale-1",
      name: "Linked tale",
      undoStack: [],
    });
  });

  it("wakes background sync only after a turn is persisted", async () => {
    const persisted = deferred<void>();
    serviceMocks.commitTaleTurn.mockReturnValueOnce(persisted.promise);
    const harness = renderHarness(usePersistTale);
    const entries = [{ id: "entry-1", role: LogEntryRole.PLAYER, text: "Go" }];
    let saving!: Promise<void>;

    act(() => {
      saving = harness.controls.saveTurn("tale-1", entries, 123);
    });
    expect(serviceMocks.commitTaleTurn).toHaveBeenCalledWith({
      id: "tale-1",
      tale: expect.objectContaining({ name: "Linked tale" }),
      entries,
      createdAt: 123,
    });
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();

    await act(async () => {
      persisted.resolve();
      await saving;
    });
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalledOnce();

    harness.cleanup();
  });

  it("rejects a stale save callback instead of copying another tale's state", async () => {
    const harness = renderHarness(usePersistTale);
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "new-tale",
      name: "Must remain in the new tale",
    });
    await expect(
      act(async () => {
        await harness.controls.save("tale-1");
      }),
    ).rejects.toThrow(/active tale changed/);
    expect(serviceMocks.persistCurrentTale).not.toHaveBeenCalled();
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("persists an explicit old-tale snapshot after the active tale changes", async () => {
    const harness = renderHarness(usePersistTale);
    const snapshot = {
      ...createLoadedTale("tale-1", "entry-1"),
      name: "Captured edits",
    };
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "new-tale",
      name: "New tale",
    });
    await act(async () => {
      await harness.controls.save("tale-1", snapshot);
    });
    expect(serviceMocks.persistCurrentTale).toHaveBeenCalledWith({
      id: "tale-1",
      tale: snapshot,
    });
    expect(useTaleStore.getState().name).toBe("New tale");
    harness.cleanup();
  });
});
