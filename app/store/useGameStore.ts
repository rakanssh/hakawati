import { GameMode, Item, LogEntry } from "@/types";
import { Stat } from "@/types/stats.type";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameStoreType {
  id: string;
  stats: Stat[];
  gameMode: GameMode;
  inventory: Item[];
  log: LogEntry[];
  undoStack: LogEntry[];
  addLog: (log: LogEntry) => void;
  removeLastLogEntry: () => void;
  updateLogEntry: (id: string, updates: Partial<LogEntry>) => void;
  modifyStat: (name: string, value: number) => void;
  addToStats: (stat: Stat) => void;
  removeFromStats: (name: string) => void;
  updateStat: (name: string, updates: Partial<Stat>) => void;
  addToInventory: (itemName: string) => void;
  removeFromInventory: (id: string) => void;
  removeFromInventoryByName: (itemName: string) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
  clearInventory: () => void;
  clearStats: () => void;
  resetAllState: () => void;
  undo: () => void;
  redo: () => void;
  setGameMode: (gameMode: GameMode) => void;
}

//TODO: Find a better way to execute/undo actions
const undoEntryActions = (
  state: GameStoreType,
  entry: LogEntry,
): Partial<GameStoreType> => {
  if (!entry.actions) {
    return {};
  }

  let newStats = [...state.stats];
  let newInventory = [...state.inventory];

  for (const action of [...entry.actions].reverse()) {
    let statValue: number | undefined;
    switch (action.type) {
      case "MODIFY_STAT":
        statValue = action.payload.value;
        if (action.payload.name && statValue !== undefined) {
          newStats = newStats.map((stat) =>
            stat.name === action.payload.name
              ? {
                  ...stat,
                  value: Math.min(
                    Math.max(stat.value - statValue!, stat.range[0]),
                    stat.range[1],
                  ),
                }
              : stat,
          );
        }
        break;
      case "ADD_TO_INVENTORY":
        if (action.payload.item) {
          const item = newInventory.find((i) => i.name === action.payload.item);
          if (item) {
            newInventory = newInventory.filter((i) => i.id !== item.id);
          }
        }
        break;
      case "REMOVE_FROM_INVENTORY":
        if (action.payload.item) {
          newInventory = [
            ...newInventory,
            {
              id: nanoid(),
              name: action.payload.item,
            },
          ];
        }
        break;
      case "ADD_TO_STATS":
        if (action.payload.name) {
          newStats = newStats.filter(
            (stat) => stat.name !== action.payload.name,
          );
        }
        break;
    }
  }
  return { stats: newStats, inventory: newInventory };
};

const redoEntryActions = (
  state: GameStoreType,
  entry: LogEntry,
): Partial<GameStoreType> => {
  if (!entry.actions) {
    return {};
  }

  let newStats = [...state.stats];
  let newInventory = [...state.inventory];

  for (const action of entry.actions) {
    let modifyValue: number | undefined;
    let addValue: number | undefined;
    switch (action.type) {
      case "MODIFY_STAT":
        modifyValue = action.payload.value;
        if (action.payload.name && modifyValue !== undefined) {
          newStats = newStats.map((stat) =>
            stat.name === action.payload.name
              ? {
                  ...stat,
                  value: Math.min(
                    Math.max(stat.value + modifyValue!, stat.range[0]),
                    stat.range[1],
                  ),
                }
              : stat,
          );
        }
        break;
      case "ADD_TO_INVENTORY":
        if (action.payload.item) {
          newInventory = [
            ...newInventory,
            {
              id: nanoid(),
              name: action.payload.item,
            },
          ];
        }
        break;
      case "REMOVE_FROM_INVENTORY":
        if (action.payload.item) {
          const item = newInventory.find((i) => i.name === action.payload.item);
          if (item) {
            newInventory = newInventory.filter((i) => i.id !== item.id);
          }
        }
        break;
      case "ADD_TO_STATS":
        addValue = action.payload.value;
        if (action.payload.name && addValue !== undefined) {
          newStats = [
            ...newStats,
            {
              name: action.payload.name,
              value: addValue,
              range: [0, 100],
            },
          ];
        }
        break;
    }
  }
  return { stats: newStats, inventory: newInventory };
};

export const useGameStore = create<GameStoreType>()(
  persist(
    (set) => ({
      id: randomUUID(),
      gameMode: GameMode.GM,
      setGameMode: (gameMode: GameMode) =>
        set({
          gameMode,
          stats: [],
          inventory: [],
        }),
      stats: [
        {
          name: "HP",
          value: 100,
          range: [0, 100],
        },
      ],
      inventory: [],
      log: [],
      undoStack: [],
      addLog: (log: LogEntry) => set((state) => ({ log: [...state.log, log] })),
      removeLastLogEntry: () =>
        set((state) => {
          const lastEntry = state.log.at(-1);
          if (!lastEntry) {
            return {};
          }
          const stateChanges = undoEntryActions(state, lastEntry);
          return { ...stateChanges, log: state.log.slice(0, -1) };
        }),
      updateLogEntry: (id, updates) =>
        set((state) => ({
          log: state.log.map((entry) =>
            entry.id === id ? { ...entry, ...updates } : entry,
          ),
        })),
      modifyStat: (name: string, value: number) =>
        set((state) => ({
          stats: state.stats.map((stat) =>
            stat.name === name
              ? {
                  ...stat,
                  value: Math.min(
                    Math.max(stat.value + value, stat.range[0]),
                    stat.range[1],
                  ),
                }
              : stat,
          ),
        })),
      addToStats: (stat: Stat) =>
        set((state) => ({ stats: [...state.stats, stat] })),
      removeFromStats: (name: string) =>
        set((state) => ({
          stats: state.stats.filter((stat) => stat.name !== name),
        })),
      updateStat: (name: string, updates: Partial<Stat>) =>
        set((state) => ({
          stats: state.stats.map((stat) =>
            stat.name === name ? { ...stat, ...updates } : stat,
          ),
        })),
      addToInventory: (itemName: string) =>
        set((state) => ({
          inventory: [
            ...state.inventory,
            {
              id: nanoid(),
              name: itemName,
            },
          ],
        })),
      removeFromInventoryByName: (itemName: string) =>
        set((state) => ({
          inventory: state.inventory.filter((i) => i.name !== itemName),
        })),
      removeFromInventory: (id: string) =>
        set((state) => ({
          inventory: state.inventory.filter((i) => i.id !== id),
        })),
      updateItem: (id: string, updates: Partial<Item>) =>
        set((state) => ({
          inventory: state.inventory.map((i) =>
            i.id === id ? { ...i, ...updates } : i,
          ),
        })),
      clearInventory: () => set({ inventory: [] }),
      clearStats: () => set({ stats: [] }),
      resetAllState: () =>
        set({
          stats: [
            {
              name: "HP",
              value: 100,
              range: [0, 100],
            },
          ],
          inventory: [],
          log: [],
          undoStack: [],
        }),
      undo: () => {
        set((state) => {
          const lastLog = state.log[state.log.length - 1];
          if (lastLog) {
            const stateChanges = undoEntryActions(state, lastLog);
            return {
              ...stateChanges,
              log: state.log.slice(0, -1),
              undoStack: [...state.undoStack, lastLog],
            };
          }
          return {};
        });
      },
      redo: () => {
        set((state) => {
          const lastLog = state.undoStack[state.undoStack.length - 1];
          if (lastLog) {
            const stateChanges = redoEntryActions(state, lastLog);
            return {
              ...stateChanges,
              log: [...state.log, lastLog],
              undoStack: state.undoStack.slice(0, -1),
            };
          }
          return {};
        });
      },
    }),
    {
      name: "game-store",
    },
  ),
);
