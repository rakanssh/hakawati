import { LogEntry } from "@/types";
import { Stat } from "@/types/stats.type";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameStoreType {
  stats: Stat[];
  inventory: string[];
  log: LogEntry[];
  addLog: (log: LogEntry) => void;
  modifyStat: (name: string, value: number) => void;
  addToStats: (stat: Stat) => void;
  removeFromStats: (name: string) => void;
  addToInventory: (item: string) => void;
  removeFromInventory: (item: string) => void;
  clearInventory: () => void;
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
      addLog: (log: LogEntry) => set((state) => ({ log: [...state.log, log] })),
      modifyStat: (name: string, value: number) =>
        set((state) => ({
          stats: state.stats.map((stat) =>
            stat.name === name ? { ...stat, value: stat.value + value } : stat
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
      clearInventory: () => set({ inventory: [] }),
    }),
    {
      name: "game-store",
    }
  )
);
