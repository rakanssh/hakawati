import { create } from "zustand";
import type { Scenario } from "@/types/context.type";

/** The scenario form open in the editor, which Hakawati can read and fill in before the player saves it. */
export interface OpenScenarioDraft {
  read: () => Scenario;
  write: (scenario: Scenario) => void;
}

export const useScenarioDraftStore = create<{
  draft: OpenScenarioDraft | null;
}>()(() => ({ draft: null }));
