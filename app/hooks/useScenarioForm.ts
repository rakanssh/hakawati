import {
  Scenario,
  PromptComponentType,
  StoryCardInput,
  StorybookCategory,
} from "@/types/context.type";
import {
  createPromptComponent,
  normalizePromptComponents,
  SCENARIO_COMPONENT_TYPES,
} from "@/lib/prompt-components";
import { getActiveStorytellerPrompt } from "@/prompts";
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
    update: Partial<{
      name: string;
      description: string | undefined;
      value: number;
      rangeMax: number;
    }>,
  ) => {
    setScenario((prev) => ({
      ...prev,
      initialStats: prev.initialStats.map((s) => {
        if (s.name !== prevName) return s;
        const nextName = update.name?.trim() ?? s.name;
        const nextDescription =
          "description" in update ? update.description : s.description;
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
          description: nextDescription,
          value: nextValue,
          range: [s.range[0], nextMax] as [number, number],
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

  const addComponent = (type: PromptComponentType) => {
    if (
      !SCENARIO_COMPONENT_TYPES.includes(type) ||
      scenario.components.some((component) => component.type === type)
    ) {
      return;
    }
    const content =
      type === PromptComponentType.AI_INSTRUCTIONS
        ? getActiveStorytellerPrompt()
        : "";
    setScenario((prev) => ({
      ...prev,
      components: normalizePromptComponents(
        [...prev.components, createPromptComponent(type, content)],
        SCENARIO_COMPONENT_TYPES,
      ),
    }));
  };

  const updateComponent = (id: string, content: string) => {
    setScenario((prev) => ({
      ...prev,
      components: prev.components.map((component) =>
        component.id === id
          ? { ...component, content, updatedAt: Date.now() }
          : component,
      ),
    }));
  };

  const removeComponent = (id: string) => {
    setScenario((prev) => ({
      ...prev,
      components: prev.components.filter((component) => component.id !== id),
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
    addComponent,
    updateComponent,
    removeComponent,
  } as const;
}
