import { create } from "zustand";
import type { Scenario } from "@/types/context.type";

/** The scenario form open in the editor, which Hakawati can read and fill in before the player saves it. */
export interface OpenScenarioDraft {
  read: () => Scenario;
  write: (scenario: Scenario) => void;
}

interface ScenarioDraftStoreType {
  draft: OpenScenarioDraft | null;
  /** Bumped when a scenario in the library changes outside its own pages. */
  libraryRevision: number;
  bumpLibrary: () => void;
}

export const useScenarioDraftStore = create<ScenarioDraftStoreType>()(
  (set) => ({
    draft: null,
    libraryRevision: 0,
    bumpLibrary: () =>
      set((state) => ({ libraryRevision: state.libraryRevision + 1 })),
  }),
);
