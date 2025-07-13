import { LogEntry } from "@/types";
import { Stat } from "@/types/stats.type";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameStoreType {
  stats: Stat[];
  inventory: string[];
  log: LogEntry[];
  undoStack: LogEntry[];
  addLog: (log: LogEntry) => void;
  removeLastLogEntry: () => void;
  updateLogEntry: (id: string, updates: Partial<LogEntry>) => void;
  modifyStat: (name: string, value: number) => void;
  addToStats: (stat: Stat) => void;
  removeFromStats: (name: string) => void;
  addToInventory: (item: string) => void;
  removeFromInventory: (item: string) => void;
  updateItem: (item: string, updates: string) => void;
  clearInventory: () => void;
  resetAllState: () => void;
  undo: () => void;
  redo: () => void;
}

export const useGameStore = create<GameStoreType>()(
  persist(
    (set) => ({
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
        set((state) => ({ log: state.log.slice(0, -1) })),
      updateLogEntry: (id, updates) =>
        set((state) => ({
          log: state.log.map((entry) =>
            entry.id === id ? { ...entry, ...updates } : entry
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
                    stat.range[1]
                  ),
                }
              : stat
          ),
        })),
      addToStats: (stat: Stat) =>
        set((state) => ({ stats: [...state.stats, stat] })),
      removeFromStats: (name: string) =>
        set((state) => ({
          stats: state.stats.filter((stat) => stat.name !== name),
        })),
      addToInventory: (item: string) =>
        set((state) => ({ inventory: [...state.inventory, item] })),
      removeFromInventory: (item: string) =>
        set((state) => ({
          inventory: state.inventory.filter((i) => i !== item),
        })),
      updateItem: (item: string, updates: string) =>
        set((state) => ({
          inventory: state.inventory.map((i) => (i === item ? updates : i)),
        })),
      clearInventory: () => set({ inventory: [] }),
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
        }),
      undo: () => {
        set((state) => {
          const lastLog = state.log[state.log.length - 1];
          if (lastLog) {
            return {
              log: state.log.slice(0, -1),
              undoStack: [...state.undoStack, lastLog],
            };
          }
          return { log: state.log, undoStack: state.undoStack };
        });
      },
      redo: () => {
        set((state) => {
          const lastLog = state.undoStack[state.undoStack.length - 1];
          if (lastLog) {
            return {
              log: [...state.log, lastLog],
              undoStack: state.undoStack.slice(0, -1),
            };
          }
          return { log: state.log, undoStack: state.undoStack };
        });
      },
    }),
    {
      name: "game-store",
    }
  )
);
