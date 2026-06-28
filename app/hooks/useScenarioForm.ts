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
import {
  editorFieldsToScenarioContent,
  scenarioContentToEditorFields,
  type ScenarioEditorFields,
} from "@/lib/scenario-content";
import { getActiveStorytellerPrompt } from "@/prompts";
import { nanoid } from "nanoid";
import { useMemo } from "react";

export function useScenarioForm(
  scenario: Scenario,
  setScenario: React.Dispatch<React.SetStateAction<Scenario>>,
) {
  const fields = useMemo(
    () => scenarioContentToEditorFields(scenario.content),
    [scenario.content],
  );

  const updateFields = (
    update: (fields: ScenarioEditorFields) => ScenarioEditorFields,
  ) => {
    setScenario((prev) => ({
      ...prev,
      content: editorFieldsToScenarioContent(
        update(scenarioContentToEditorFields(prev.content)),
      ),
    }));
  };

  const addStat = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      fields.initialStats.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
      )
    )
      return;
    updateFields((prev) => ({
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
    updateFields((prev) => ({
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
    updateFields((prev) => ({
      ...prev,
      initialStats: prev.initialStats.filter((s) => s.name !== name),
    }));
  };

  const addInventoryItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateFields((prev) => ({
      ...prev,
      initialInventory: [...prev.initialInventory, trimmed],
    }));
  };

  const updateInventoryItem = (index: number, name: string) => {
    const copy = [...fields.initialInventory];
    copy[index] = name;
    updateFields((prev) => ({ ...prev, initialInventory: copy }));
  };

  const removeInventoryItem = (index: number) => {
    updateFields((prev) => {
      const copy = [...prev.initialInventory];
      copy.splice(index, 1);
      return { ...prev, initialInventory: copy };
    });
  };

  const addStoryCard = (input: StoryCardInput) => {
    const now = Date.now();
    updateFields((prev) => ({
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
    updateFields((prev) => ({
      ...prev,
      initialStoryCards: prev.initialStoryCards.map((c) =>
        c.id === id ? { ...c, ...update, updatedAt: Date.now() } : c,
      ),
    }));
  };

  const removeStoryCard = (id: string) => {
    updateFields((prev) => ({
      ...prev,
      initialStoryCards: prev.initialStoryCards.filter((c) => c.id !== id),
    }));
  };

  const addComponent = (type: PromptComponentType) => {
    if (
      !SCENARIO_COMPONENT_TYPES.includes(type) ||
      fields.components.some((component) => component.type === type)
    ) {
      return;
    }
    const content =
      type === PromptComponentType.AI_INSTRUCTIONS
        ? getActiveStorytellerPrompt()
        : "";
    updateFields((prev) => ({
      ...prev,
      components: normalizePromptComponents(
        [...prev.components, createPromptComponent(type, content)],
        SCENARIO_COMPONENT_TYPES,
      ),
    }));
  };

  const updateComponent = (id: string, content: string) => {
    updateFields((prev) => ({
      ...prev,
      components: prev.components.map((component) =>
        component.id === id
          ? { ...component, content, updatedAt: Date.now() }
          : component,
      ),
    }));
  };

  const removeComponent = (id: string) => {
    updateFields((prev) => ({
      ...prev,
      components: prev.components.filter((component) => component.id !== id),
    }));
  };

  return {
    fields,
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
