import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LogEntryRole,
  type LogActionState,
  type LogEntry,
} from "@/types/log.type";

vi.mock("@/repositories/tale.repository", () => ({ getLogEntries: vi.fn() }));
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

import { useTaleStore } from "./useTaleStore";
import { getLogEntries } from "@/repositories/tale.repository";

function snapshot(): LogActionState {
  const { stats, inventory } = useTaleStore.getState();
  return structuredClone({ stats, inventory });
}

function completeTurn(
  before: LogActionState,
  actions: NonNullable<LogEntry["actions"]>,
) {
  useTaleStore.getState().addLog({
    id: "turn",
    role: LogEntryRole.GM,
    text: "The result",
    actions,
    actionState: { before, after: snapshot() },
  });
}

describe("exact GM action undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaleStore.setState({
      id: "tale",
      stats: [{ name: "HP", value: 95, range: [0, 100] }],
      inventory: [],
      log: [],
      undoStack: [],
      totalLogCount: 0,
      oldestLoadedIndex: 0,
      isLoadingOlderEntries: false,
    });
  });

  it("does not prepend old rows after the visible log window moves", async () => {
    let resolve!: (entries: LogEntry[]) => void;
    vi.mocked(getLogEntries).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    useTaleStore.setState({
      oldestLoadedIndex: 100,
      totalLogCount: 101,
      log: [{ id: "old-window", role: LogEntryRole.GM, text: "Old window" }],
    });
    const loading = useTaleStore.getState().loadOlderLogEntries(50);
    const currentWindow: LogEntry[] = [
      { id: "new-window", role: LogEntryRole.GM, text: "New window" },
    ];
    useTaleStore.setState({
      oldestLoadedIndex: 200,
      totalLogCount: 201,
      log: currentWindow,
    });
    resolve([
      {
        id: "stale",
        role: LogEntryRole.GM,
        text: "Outside the current window",
      },
    ]);
    await loading;
    expect(useTaleStore.getState().log).toEqual(currentWindow);
    expect(useTaleStore.getState().oldestLoadedIndex).toBe(200);
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(false);
  });

  it("does not clear another tale's pending history load when an older request finishes", async () => {
    let finishFirst!: (entries: LogEntry[]) => void;
    let finishSecond!: (entries: LogEntry[]) => void;
    vi.mocked(getLogEntries)
      .mockReturnValueOnce(
        new Promise((done) => {
          finishFirst = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          finishSecond = done;
        }),
      );
    useTaleStore.setState({ oldestLoadedIndex: 10 });
    const first = useTaleStore.getState().loadOlderLogEntries(5);
    useTaleStore.setState({
      id: "second-tale",
      oldestLoadedIndex: 20,
      isLoadingOlderEntries: false,
    });
    const second = useTaleStore.getState().loadOlderLogEntries(5);
    finishFirst([]);
    await first;
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(true);
    const entries: LogEntry[] = [
      { id: "second", role: LogEntryRole.GM, text: "Second tale history" },
    ];
    finishSecond(entries);
    await second;
    expect(useTaleStore.getState().log).toEqual(entries);
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(false);
  });

  it("restores the original stat after undoing a clamped increase", () => {
    const before = snapshot();
    useTaleStore.getState().modifyStat("HP", 10);
    completeTurn(before, [
      { type: "MODIFY_STAT", payload: { name: "HP", value: 10 } },
    ]);
    expect(useTaleStore.getState().stats[0].value).toBe(100);
    useTaleStore.getState().undo();
    expect(useTaleStore.getState().stats[0].value).toBe(95);
    useTaleStore.getState().redo();
    expect(useTaleStore.getState().stats[0].value).toBe(100);
  });

  it("restores removed items with their original ids and descriptions, including duplicates", () => {
    const inventory = [
      { id: "silver-key", name: "Key", description: "Opens the silver door" },
      { id: "gold-key", name: "Key", description: "Opens the gold door" },
    ];
    useTaleStore.setState({ inventory });
    const before = snapshot();
    useTaleStore.getState().removeFromInventoryByName("Key");
    completeTurn(before, [
      { type: "REMOVE_FROM_INVENTORY", payload: { item: "Key" } },
    ]);
    useTaleStore.getState().undo();
    expect(useTaleStore.getState().inventory).toEqual(inventory);
    useTaleStore.getState().redo();
    expect(useTaleStore.getState().inventory).toEqual([]);
  });

  it("restores exact state when retry removes and then restores a GM entry", () => {
    const before = snapshot();
    useTaleStore.getState().modifyStat("HP", 10);
    completeTurn(before, [
      { type: "MODIFY_STAT", payload: { name: "HP", value: 10 } },
    ]);
    const entry = useTaleStore.getState().log[0];
    useTaleStore.getState().removeLastLogEntry();
    expect(useTaleStore.getState().stats[0].value).toBe(95);
    useTaleStore.getState().restoreLogEntry(entry);
    expect(useTaleStore.getState().stats[0].value).toBe(100);
  });

  it("retains compatibility with historical log entries without snapshots", () => {
    useTaleStore.getState().addLog({
      id: "old",
      role: LogEntryRole.GM,
      text: "Old turn",
      actions: [{ type: "MODIFY_STAT", payload: { name: "HP", value: 5 } }],
    });
    useTaleStore.getState().undo();
    expect(useTaleStore.getState().stats[0].value).toBe(90);
    useTaleStore.getState().redo();
    expect(useTaleStore.getState().stats[0].value).toBe(95);
  });
});
