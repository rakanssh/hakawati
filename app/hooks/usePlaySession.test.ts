import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiPreset, ApiType } from "@/types/api.type";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";

const taleStoreMocks = vi.hoisted(() => {
  type MockTaleState = {
    id: string;
    name: string;
    description: string;
    components: unknown[];
    storyCards: unknown[];
    stats: { name: string; value: number; range: [number, number] }[];
    inventory: { id: string; name: string; description?: string }[];
    log: LogEntry[];
    gameMode: string;
    undoStack: LogEntry[];
    totalLogCount: number;
    oldestLoadedIndex: number;
    logWindowSize: number;
    isLoadingOlderEntries: boolean;
    addLog: (entry: LogEntry) => void;
    restoreLogEntry: (entry: LogEntry) => void;
    updateLogEntry: (id: string, updates: Partial<LogEntry>) => void;
    removeLastLogEntry: () => void;
    modifyStat: (name: string, value: number) => void;
    addToInventory: (itemName: string, itemDescription?: string) => void;
    removeFromInventoryByName: (itemName: string) => void;
    addToStats: (stat: {
      name: string;
      value: number;
      range: [number, number];
    }) => void;
    undo: () => void;
    redo: () => void;
  };

  function setState(
    patch:
      | Partial<MockTaleState>
      | ((current: MockTaleState) => Partial<MockTaleState>),
  ) {
    Object.assign(state, typeof patch === "function" ? patch(state) : patch);
  }

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
      addLog: (entry) =>
        setState((current) => ({
          log: [...current.log, entry],
          totalLogCount: current.totalLogCount + 1,
          undoStack: [],
        })),
      restoreLogEntry: (entry) =>
        setState((current) => ({
          log: [...current.log, entry],
          totalLogCount: current.totalLogCount + 1,
          undoStack: [],
        })),
      updateLogEntry: (id, updates) =>
        setState((current) => ({
          log: current.log.map((entry) =>
            entry.id === id ? { ...entry, ...updates } : entry,
          ),
        })),
      removeLastLogEntry: () =>
        setState((current) => ({
          log: current.log.slice(0, -1),
          totalLogCount: Math.max(0, current.totalLogCount - 1),
          undoStack: [],
        })),
      modifyStat: (name, value) =>
        setState((current) => ({
          stats: current.stats.map((stat) =>
            stat.name === name
              ? {
                  ...stat,
                  value: Math.min(
                    stat.range[1],
                    Math.max(stat.range[0], stat.value + value),
                  ),
                }
              : stat,
          ),
        })),
      addToInventory: (itemName, itemDescription) =>
        setState((current) => ({
          inventory: [
            ...current.inventory,
            {
              id: `item-${current.inventory.length + 1}`,
              name: itemName,
              description: itemDescription,
            },
          ],
        })),
      removeFromInventoryByName: (itemName) =>
        setState((current) => ({
          inventory: current.inventory.filter((item) => item.name !== itemName),
        })),
      addToStats: (stat) =>
        setState((current) => ({ stats: [...current.stats, stat] })),
      undo: vi.fn(),
      redo: vi.fn(),
    };
  }

  const state = createState();

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

const settingsStoreMocks = vi.hoisted(() => {
  type MockModelConfig = {
    apiType: string;
    activePreset: string;
    profiles: Record<string, unknown>;
    baseUrl: string;
    apiKey: string;
    model: { id: string; name: string } | undefined;
  };
  type MockSettingsState = {
    modelRoles: { narrator: MockModelConfig };
    randomSeed: () => void;
  };

  const randomSeed = vi.fn();
  const state: MockSettingsState = {
    modelRoles: {
      narrator: {
        apiType: "openai",
        activePreset: "generic",
        profiles: {},
        baseUrl: "https://example.test/v1",
        apiKey: "",
        model: { id: "narrator-model", name: "Narrator" },
      },
    },
    randomSeed,
  };

  const useSettingsStore = Object.assign(
    (selector?: (current: typeof state) => unknown) =>
      selector ? selector(state) : state,
    {
      getState: () => state,
      setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
    },
  );

  return { randomSeed, state, useSettingsStore };
});

const llmMocks = vi.hoisted(() => ({
  send: vi.fn(),
  cancel: vi.fn(),
}));

const persistenceMocks = vi.hoisted(() => ({
  save: vi.fn(),
  saveTurn: vi.fn(),
  completePendingTurn: vi.fn(),
  retryTurn: vi.fn(),
  undoToEntryCount: vi.fn(),
  editEntry: vi.fn(),
  retryEntry: vi.fn(),
  redoEntry: vi.fn(),
}));

vi.mock("@/hooks/useLLM", () => ({
  useLLM: () => ({
    send: llmMocks.send,
    loading: false,
    cancel: llmMocks.cancel,
  }),
}));

vi.mock("@/hooks/useGameSaves", () => ({
  usePersistTale: () => ({
    ...persistenceMocks,
    saving: false,
    error: null,
    lastSaveSuccess: false,
  }),
}));

vi.mock("@/store/useTaleStore", () => ({
  useTaleStore: taleStoreMocks.useTaleStore,
}));

vi.mock("@/store/useSettingsStore", () => ({
  isModelRoleConfigured: () => true,
  useSettingsStore: settingsStoreMocks.useSettingsStore,
}));

import { usePlaySession } from "./usePlaySession";

function renderSessionHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof usePlaySession> | undefined;

  function Harness() {
    controls = usePlaySession();
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

describe("usePlaySession", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    taleStoreMocks.reset({
      id: "tale-1",
      name: "Tale",
      description: "",
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      log: [],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [],
      totalLogCount: 0,
      oldestLoadedIndex: 0,
      logWindowSize: 200,
      isLoadingOlderEntries: false,
    });
    settingsStoreMocks.useSettingsStore.setState({
      modelRoles: {
        narrator: {
          apiType: ApiType.OPENAI,
          activePreset: ApiPreset.GENERIC,
          profiles: {},
          baseUrl: "https://example.test/v1",
          apiKey: "",
          model: { id: "narrator-model", name: "Narrator" },
        },
      },
    });
  });

  async function flushAsyncWork() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("retains before/after action state across multiple batches for exact undo", async () => {
    const key = { id: "key-1", name: "Key", description: "Opens the vault" };
    taleStoreMocks.useTaleStore.setState({
      stats: [{ name: "HP", value: 95, range: [0, 100] }],
      inventory: [key],
    });
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      callbacks.onActionsReady([
        { type: "MODIFY_STAT", payload: { name: "HP", value: 10 } },
      ]);
      callbacks.onActionsReady([
        { type: "REMOVE_FROM_INVENTORY", payload: { item: "Key" } },
      ]);
      callbacks.onStoryStream("You heal and unlock the vault.");
      return { status: "completed" };
    });
    const harness = renderSessionHarness();
    try {
      const entry = await act(async () =>
        harness.controls.executeLlmSend("Unlock the vault", LogEntryMode.DO),
      );
      expect(entry?.actions).toHaveLength(2);
      expect(entry?.actionState).toEqual({
        before: {
          stats: [{ name: "HP", value: 95, range: [0, 100] }],
          inventory: [key],
        },
        after: {
          stats: [{ name: "HP", value: 100, range: [0, 100] }],
          inventory: [],
        },
      });
    } finally {
      harness.cleanup();
    }
  });

  it("ignores late narration and GM actions after a different tale is loaded", async () => {
    let complete!: () => void;
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      callbacks.onActionsReady([
        { type: "MODIFY_STAT", payload: { name: "HP", value: -40 } },
      ]);
      callbacks.onStoryStream("The previous tale's response.");
      return { status: "completed" };
    });
    const harness = renderSessionHarness();
    let pending!: Promise<LogEntry | null>;
    act(() => {
      pending = harness.controls.executeLlmSend(
        "Open the door",
        LogEntryMode.DO,
      );
    });
    taleStoreMocks.reset({
      id: "tale-2",
      log: [],
      totalLogCount: 0,
      stats: [{ name: "HP", value: 100, range: [0, 100] }],
    });
    await act(async () => {
      complete();
      await pending;
    });
    expect(taleStoreMocks.state.log).toEqual([]);
    expect(taleStoreMocks.state.stats[0].value).toBe(100);
    expect(persistenceMocks.saveTurn).not.toHaveBeenCalled();
    expect(await pending).toBeNull();
    harness.cleanup();
  });

  it("cancels and ignores a generation that finishes after the play page unmounts", async () => {
    let complete!: () => void;
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      callbacks.onStoryStream("A late response.");
      return { status: "completed" };
    });
    const harness = renderSessionHarness();
    let pending!: Promise<LogEntry | null>;
    act(() => {
      pending = harness.controls.executeLlmSend(
        "Open the door",
        LogEntryMode.DO,
      );
    });
    harness.cleanup();
    expect(llmMocks.cancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete();
      await pending;
    });
    expect(persistenceMocks.saveTurn).not.toHaveBeenCalled();
    expect(await pending).toBeNull();
  });

  it("removes the placeholder GM entry and skips persistence when generation aborts", async () => {
    llmMocks.send.mockResolvedValueOnce({
      status: "aborted",
      error: new DOMException("Aborted", "AbortError"),
    });
    const harness = renderSessionHarness();

    const result = await act(async () =>
      harness.controls.executeLlmSend("Open the door", LogEntryMode.DO),
    );

    expect(result).toBeNull();
    expect(taleStoreMocks.state.log).toEqual([]);
    expect(taleStoreMocks.state.totalLogCount).toBe(0);
    expect(persistenceMocks.saveTurn).not.toHaveBeenCalled();
    expect(persistenceMocks.completePendingTurn).not.toHaveBeenCalled();
    expect(persistenceMocks.undoToEntryCount).not.toHaveBeenCalled();
    expect(persistenceMocks.retryTurn).not.toHaveBeenCalled();
    expect(persistenceMocks.retryEntry).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("persists a normal submit as a completed partial turn when generation aborts after text", async () => {
    persistenceMocks.saveTurn.mockResolvedValueOnce(undefined);
    persistenceMocks.completePendingTurn.mockResolvedValueOnce(undefined);
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      callbacks.onStoryStream("The hinges scream.");
      return {
        status: "aborted",
        error: new DOMException("Aborted", "AbortError"),
      };
    });
    const harness = renderSessionHarness();

    act(() => {
      harness.controls.setInput("Open the door");
    });
    await act(async () => {
      await harness.controls.handleSubmit();
    });
    await flushAsyncWork();

    const pendingEntries = persistenceMocks.saveTurn.mock.calls[0][1];
    const finalizedEntries =
      persistenceMocks.completePendingTurn.mock.calls[0][2];

    expect(persistenceMocks.saveTurn).toHaveBeenCalledWith(
      "tale-1",
      expect.any(Array),
    );
    expect(persistenceMocks.completePendingTurn).toHaveBeenCalledWith(
      "tale-1",
      pendingEntries,
      expect.any(Array),
      expect.any(Number),
      false,
    );
    expect(finalizedEntries.map((entry: LogEntry) => entry.role)).toEqual([
      "player",
      "gm",
    ]);
    expect(finalizedEntries[1].text).toBe("The hinges scream.");
    expect(persistenceMocks.undoToEntryCount).not.toHaveBeenCalled();
    expect(taleStoreMocks.state.log.map((entry) => entry.text)).toEqual([
      "Open the door",
      "The hinges scream.",
    ]);

    harness.cleanup();
  });

  it("cancels a normal submit when generation aborts before text", async () => {
    persistenceMocks.saveTurn.mockResolvedValueOnce(undefined);
    persistenceMocks.undoToEntryCount.mockResolvedValueOnce(undefined);
    llmMocks.send.mockResolvedValueOnce({
      status: "aborted",
      error: new DOMException("Aborted", "AbortError"),
    });
    const harness = renderSessionHarness();

    act(() => {
      harness.controls.setInput("Open the door");
    });
    await act(async () => {
      await harness.controls.handleSubmit();
    });
    await flushAsyncWork();

    expect(persistenceMocks.saveTurn).toHaveBeenCalledWith(
      "tale-1",
      expect.any(Array),
    );
    expect(persistenceMocks.undoToEntryCount).toHaveBeenCalledWith("tale-1", 0);
    expect(persistenceMocks.completePendingTurn).not.toHaveBeenCalled();
    expect(taleStoreMocks.state.log).toEqual([]);
    expect(taleStoreMocks.state.totalLogCount).toBe(0);

    harness.cleanup();
  });

  it("saves a partial continuation when continue generation aborts after text", async () => {
    taleStoreMocks.reset({
      id: "tale-1",
      log: [
        {
          id: "gm-existing",
          role: LogEntryRole.GM,
          text: "The hall waits.",
        } as LogEntry,
      ],
      totalLogCount: 1,
    });
    persistenceMocks.editEntry.mockResolvedValueOnce(undefined);
    persistenceMocks.saveTurn.mockResolvedValueOnce(undefined);
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      callbacks.onStoryStream(" A torch flickers.");
      return {
        status: "aborted",
        error: new DOMException("Aborted", "AbortError"),
      };
    });
    const harness = renderSessionHarness();

    act(() => {
      harness.controls.handleContinue();
    });
    await flushAsyncWork();

    expect(persistenceMocks.saveTurn).toHaveBeenCalledWith(
      "tale-1",
      expect.any(Array),
    );
    const savedEntries = persistenceMocks.saveTurn.mock.calls[0][1];
    expect(savedEntries).toHaveLength(1);
    expect(savedEntries[0].text).toBe(" A torch flickers.");
    expect(taleStoreMocks.state.log.map((entry) => entry.text)).toEqual([
      "The hall waits. ",
      " A torch flickers.",
    ]);

    harness.cleanup();
  });

  it("replaces the retried turn when retry aborts after text", async () => {
    const playerEntry: LogEntry = {
      id: "player-1",
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.DO,
      text: "Open the door",
    };
    const oldGmEntry: LogEntry = {
      id: "gm-old",
      role: LogEntryRole.GM,
      text: "It stays shut.",
    };
    taleStoreMocks.reset({
      id: "tale-1",
      log: [playerEntry, oldGmEntry],
      totalLogCount: 2,
    });
    persistenceMocks.retryTurn.mockResolvedValueOnce(undefined);
    llmMocks.send.mockImplementationOnce(async (_message, callbacks) => {
      callbacks.onStoryStream("It opens halfway.");
      return {
        status: "aborted",
        error: new DOMException("Aborted", "AbortError"),
      };
    });
    const harness = renderSessionHarness();

    act(() => {
      harness.controls.handleRetry();
    });
    await flushAsyncWork();

    expect(persistenceMocks.retryTurn).toHaveBeenCalledWith(
      "tale-1",
      [playerEntry, oldGmEntry],
      expect.any(Array),
    );
    const replacementEntries = persistenceMocks.retryTurn.mock.calls[0][2];
    expect(replacementEntries.map((entry: LogEntry) => entry.text)).toEqual([
      "Open the door",
      "It opens halfway.",
    ]);
    expect(taleStoreMocks.state.log.map((entry) => entry.text)).toEqual([
      "Open the door",
      "It opens halfway.",
    ]);

    harness.cleanup();
  });

  it("restores the retried entry when retry aborts before text", async () => {
    const playerEntry: LogEntry = {
      id: "player-1",
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.DO,
      text: "Open the door",
    };
    const oldGmEntry: LogEntry = {
      id: "gm-old",
      role: LogEntryRole.GM,
      text: "It stays shut.",
    };
    taleStoreMocks.reset({
      id: "tale-1",
      log: [playerEntry, oldGmEntry],
      totalLogCount: 2,
    });
    llmMocks.send.mockResolvedValueOnce({
      status: "aborted",
      error: new DOMException("Aborted", "AbortError"),
    });
    const harness = renderSessionHarness();

    act(() => {
      harness.controls.handleRetry();
    });
    await flushAsyncWork();

    expect(persistenceMocks.retryTurn).not.toHaveBeenCalled();
    expect(persistenceMocks.retryEntry).not.toHaveBeenCalled();
    expect(taleStoreMocks.state.log).toEqual([playerEntry, oldGmEntry]);
    expect(taleStoreMocks.state.totalLogCount).toBe(2);

    harness.cleanup();
  });
});
