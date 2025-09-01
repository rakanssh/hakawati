import { Scenario, StoryCardInput } from "@/types/context.type";
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
    setScenario({
      ...scenario,
      initialStats: [
        ...scenario.initialStats,
        { name: trimmed, value: 0, range: [0, 100] },
      ],
    });
  };

  const updateStat = (
    prevName: string,
    update: Partial<{ name: string; value: number; rangeMax: number }>,
  ) => {
    setScenario({
      ...scenario,
      initialStats: scenario.initialStats.map((s) => {
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
    });
  };

  const removeStat = (name: string) => {
    setScenario({
      ...scenario,
      initialStats: scenario.initialStats.filter((s) => s.name !== name),
    });
  };

  const addInventoryItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setScenario({
      ...scenario,
      initialInventory: [...scenario.initialInventory, trimmed],
    });
  };

  const updateInventoryItem = (index: number, name: string) => {
    const copy = [...scenario.initialInventory];
    copy[index] = name;
    setScenario({ ...scenario, initialInventory: copy });
  };

  const removeInventoryItem = (index: number) => {
    const copy = [...scenario.initialInventory];
    copy.splice(index, 1);
    setScenario({ ...scenario, initialInventory: copy });
  };

  const addStoryCard = (input: StoryCardInput) => {
    setScenario({
      ...scenario,
      initialStoryCards: [
        ...scenario.initialStoryCards,
        { id: nanoid(12), ...input },
      ],
    });
  };

  const updateStoryCard = (id: string, update: Partial<StoryCardInput>) => {
    setScenario({
      ...scenario,
      initialStoryCards: scenario.initialStoryCards.map((c) =>
        c.id === id ? { ...c, ...update } : c,
      ),
    });
  };

  const removeStoryCard = (id: string) => {
    setScenario({
      ...scenario,
      initialStoryCards: scenario.initialStoryCards.filter((c) => c.id !== id),
    });
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
