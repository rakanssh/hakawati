import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LogEntryRole,
  type LogActionState,
  type LogEntry,
} from "@/types/log.type";

vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

import { useTaleStore } from "./useTaleStore";

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
    useTaleStore.getState().removeFromInventoryByName("Key");
    completeTurn(before, [
      { type: "REMOVE_FROM_INVENTORY", payload: { item: "Key" } },
      { type: "REMOVE_FROM_INVENTORY", payload: { item: "Key" } },
    ]);
    useTaleStore.getState().undo();
    expect(useTaleStore.getState().inventory).toEqual(inventory);
    useTaleStore.getState().redo();
    expect(useTaleStore.getState().inventory).toEqual([]);
  });

  it("removes one copy of an item the player holds several of", () => {
    const potion = (id: string) => ({ id, name: "Health Potion" });
    useTaleStore.setState({
      inventory: [potion("potion-1"), { id: "rope", name: "Rope" }],
    });
    useTaleStore.getState().addToInventory("Health Potion");
    const newest = useTaleStore.getState().inventory[2];

    useTaleStore.getState().removeFromInventoryByName("Health Potion");
    expect(useTaleStore.getState().inventory).toEqual([
      potion("potion-1"),
      { id: "rope", name: "Rope" },
    ]);
    expect(useTaleStore.getState().inventory).not.toContainEqual(newest);

    useTaleStore.getState().removeFromInventoryByName("Lantern");
    expect(useTaleStore.getState().inventory).toHaveLength(2);
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
