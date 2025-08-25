import { Scenario } from "@/types/context.type";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

interface ScenarioStoreType {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
}

export const useScenarioStore = create<ScenarioStoreType>()(
  persist(
    (set) => ({
      scenario: {
        id: nanoid(12),
        name: "Default",
        initialDescription: "",
        initialAuthorNote: "",
        initialStats: [],
        initialInventory: [],
        initialStoryCards: [],
      },
      setScenario: (scenario: Scenario) => set({ scenario }),
    }),
    {
      name: "scenario",
    },
  ),
);
