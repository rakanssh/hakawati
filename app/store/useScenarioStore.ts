import { Scenario, StoryCard, StoryCardInput } from "@/types/context.type";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

interface ScenarioStoreType {
  scenario: Scenario;
  storyCards: StoryCard[];
  setScenario: (scenario: Scenario) => void;
  setStoryCards: (storyCards: StoryCard[]) => void;
  addStoryCard: (storyCard: StoryCardInput) => void;
  removeStoryCard: (id: string) => void;
  updateStoryCard: (id: string, updates: Partial<StoryCardInput>) => void;
  clearStoryCards: () => void;
}

export const useScenarioStore = create<ScenarioStoreType>()(
  persist(
    (set) => ({
      scenario: {
        name: "Default",
        description: "",
        authorNote: "",
        initialStats: [],
        initialInventory: [],
        initialStoryCards: [],
      },
      storyCards: [],
      setScenario: (scenario: Scenario) => set({ scenario }),
      setStoryCards: (storyCards: StoryCard[]) => set({ storyCards }),
      addStoryCard: (storyCard: StoryCardInput) =>
        set((state) => ({
          storyCards: [...state.storyCards, { ...storyCard, id: nanoid(12) }],
        })),
      removeStoryCard: (id: string) =>
        set((state) => ({
          storyCards: state.storyCards.filter(
            (storyCard) => storyCard.id !== id
          ),
        })),
      updateStoryCard: (id: string, updates: Partial<StoryCardInput>) =>
        set((state) => ({
          storyCards: state.storyCards.map((storyCard) =>
            storyCard.id === id ? { ...storyCard, ...updates } : storyCard
          ),
        })),
      clearStoryCards: () => set({ storyCards: [] }),
    }),
    {
      name: "scenario",
    }
  )
);
