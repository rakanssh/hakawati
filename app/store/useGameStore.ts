import { create } from "zustand";

//TODO: Make this dynamic and changeable
interface GameStoreType {
  stats: {
    health: number;
  };
  inventory: string[];
  modifyHealth: (value: number) => void;
  addToInventory: (item: string) => void;
  removeFromInventory: (item: string) => void;
  clearInventory: () => void;
}

export const useGameStore = create<GameStoreType>((set) => ({
  stats: {
    health: 100,
  },
  inventory: [],
  modifyHealth: (value: number) =>
    set((state) => ({
      stats: { ...state.stats, health: state.stats.health + value },
    })),
  addToInventory: (item: string) =>
    set((state) => ({ inventory: [...state.inventory, item] })),
  removeFromInventory: (item: string) =>
    set((state) => ({ inventory: state.inventory.filter((i) => i !== item) })),
  clearInventory: () => set({ inventory: [] }),
}));
