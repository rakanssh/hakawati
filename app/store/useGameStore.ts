import { LogEntry } from "@/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

//TODO: Make this dynamic and changeable
interface GameStoreType {
  stats: {
    hp: number;
  };
  inventory: string[];
  log: LogEntry[];
  addLog: (log: LogEntry) => void;
  modifyHp: (value: number) => void;
  addToInventory: (item: string) => void;
  removeFromInventory: (item: string) => void;
  clearInventory: () => void;
}

export const useGameStore = create<GameStoreType>()(
  persist(
    (set) => ({
      stats: {
        hp: 100,
      },
      inventory: [],
      log: [],
      addLog: (log: LogEntry) => set((state) => ({ log: [...state.log, log] })),
      modifyHp: (value: number) =>
        set((state) => ({
          stats: { ...state.stats, hp: state.stats.hp + value },
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
