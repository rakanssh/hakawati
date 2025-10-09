import {
  Scenario,
  StoryCardInput,
  StorybookCategory,
} from "@/types/context.type";
import { nanoid } from "nanoid";

export function useScenarioForm(
  scenario: Scenario,
  setScenario: React.Dispatch<React.SetStateAction<Scenario>>,
) {
  const addStat = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      scenario.initialStats.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
      )
    )
      return;
    setScenario((prev) => ({
      ...prev,
      initialStats: [
        ...prev.initialStats,
        { name: trimmed, value: 0, range: [0, 100] },
      ],
    }));
  };

  const updateStat = (
    prevName: string,
    update: Partial<{ name: string; value: number; rangeMax: number }>,
  ) => {
    setScenario((prev) => ({
      ...prev,
      initialStats: prev.initialStats.map((s) => {
        if (s.name !== prevName) return s;
        const nextName = update.name?.trim() ?? s.name;
        const nextValue =
          typeof update.value === "number"
            ? Math.max(s.range[0], Math.min(update.value, s.range[1]))
            : s.value;
        const nextMax =
          typeof update.rangeMax === "number"
            ? Math.max(s.range[0], Math.max(update.rangeMax, nextValue))
            : s.range[1];
        return {
          name: nextName,
          value: nextValue,
          range: [s.range[0], nextMax],
        };
      }),
    }));
  };

  const removeStat = (name: string) => {
    setScenario((prev) => ({
      ...prev,
      initialStats: prev.initialStats.filter((s) => s.name !== name),
    }));
  };

  const addInventoryItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setScenario((prev) => ({
      ...prev,
      initialInventory: [...prev.initialInventory, trimmed],
    }));
  };

  const updateInventoryItem = (index: number, name: string) => {
    const copy = [...scenario.initialInventory];
    copy[index] = name;
    setScenario({ ...scenario, initialInventory: copy });
  };

  const removeInventoryItem = (index: number) => {
    setScenario((prev) => {
      const copy = [...prev.initialInventory];
      copy.splice(index, 1);
      return { ...prev, initialInventory: copy };
    });
  };

  const addStoryCard = (input: StoryCardInput) => {
    const now = Date.now();
    setScenario((prev) => ({
      ...prev,
      initialStoryCards: [
        ...prev.initialStoryCards,
        {
          id: nanoid(12),
          ...input,
          category: input.category ?? StorybookCategory.UNCATEGORIZED,
          isPinned: input.isPinned ?? false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
  };

  const updateStoryCard = (id: string, update: Partial<StoryCardInput>) => {
    setScenario((prev) => ({
      ...prev,
      initialStoryCards: prev.initialStoryCards.map((c) =>
        c.id === id ? { ...c, ...update, updatedAt: Date.now() } : c,
      ),
    }));
  };

  const removeStoryCard = (id: string) => {
    setScenario((prev) => ({
      ...prev,
      initialStoryCards: prev.initialStoryCards.filter((c) => c.id !== id),
    }));
  };

  return {
    addStat,
    updateStat,
    removeStat,
    addInventoryItem,
    updateInventoryItem,
    removeInventoryItem,
    addStoryCard,
    updateStoryCard,
    removeStoryCard,
  } as const;
}
