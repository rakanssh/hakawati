import { create } from "zustand";

/** Counts saves and deletes of library scenarios, so open scenario pages can reload. */
export const useScenarioLibraryStore = create<{
  revision: number;
  bump: () => void;
}>()((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));
