import { create } from "zustand";
import type { Scenario } from "@/types/context.type";

export interface OpenScenarioDraft {
  read: () => Scenario;
  write: (scenario: Scenario) => void;
}

export const useScenarioDraftStore = create<{
  draft: OpenScenarioDraft | null;
}>()(() => ({ draft: null }));
