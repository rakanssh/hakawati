import { nanoid } from "nanoid";
import { z } from "zod";
import {
  GameMode,
  PromptComponent,
  PromptComponentType,
  ScenarioContent,
  StorybookCategory,
  StoryCard,
} from "@/types/context.type";
import type { Item } from "@/types/item.type";
import type { Stat } from "@/types/stats.type";
import {
  normalizePromptComponents,
  SCENARIO_COMPONENT_TYPES,
  TALE_COMPONENT_TYPES,
} from "@/lib/prompt-components";
import {
  normalizeStoryCard,
  normalizeStorybookCategory,
} from "./story-card-utils";

export type ScenarioEditorFields = {
  components: PromptComponent[];
  initialStats: Stat[];
  initialInventory: string[];
  initialStoryCards: StoryCard[];
};

export type ScenarioLegacyFields = Partial<ScenarioEditorFields> & {
  description?: string;
  initialDescription?: string;
  initialAuthorNote?: string;
  openingText?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type TaleSeed = {
  components: PromptComponent[];
  storyCards: StoryCard[];
  stats: Stat[];
  inventory: Item[];
  openingText: string;
};

const promptComponentContentSchema = z.object({
  type: z.literal("prompt_component"),
  version: z.literal(1),
  id: z.string(),
  promptType: z.enum([
    PromptComponentType.AI_INSTRUCTIONS,
    PromptComponentType.PLOT,
    PromptComponentType.AUTHOR_NOTE,
    PromptComponentType.OPENING,
  ]),
  content: z.string(),
});

const storyCardContentSchema = z.object({
  type: z.literal("story_card"),
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  triggers: z.array(z.string()).default([]),
  content: z.string(),
  category: z
    .enum([
      StorybookCategory.CHARACTER,
      StorybookCategory.THING,
      StorybookCategory.PLACE,
      StorybookCategory.CONCEPT,
      StorybookCategory.UNCATEGORIZED,
    ])
    .catch(StorybookCategory.UNCATEGORIZED),
  isPinned: z.boolean().default(false),
});

const statContentSchema = z.object({
  type: z.literal("stat"),
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  value: z.number().finite(),
  range: z.tuple([z.number().finite(), z.number().finite()]),
});

const inventoryItemContentSchema = z.object({
  type: z.literal("inventory_item"),
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const ScenarioContentSchema = z.discriminatedUnion("type", [
  promptComponentContentSchema,
  storyCardContentSchema,
  statContentSchema,
  inventoryItemContentSchema,
]);

function trimmedOptional(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizeTriggers(triggers: string[]) {
  return [
    ...new Set(
      triggers
        .map((trigger) => trigger.trim())
        .filter((trigger) => trigger.length > 0),
    ),
  ];
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function deterministicScenarioContentId(
  kind: "stat" | "inventory_item",
  name: string,
  index: number,
) {
  const base = slug(name);
  return base ? `${kind}-${base}-${index + 1}` : `${kind}-${index + 1}`;
}

export function normalizeScenarioContent(content: unknown): ScenarioContent[] {
  const parsed = z.array(ScenarioContentSchema).parse(content ?? []);
  return parsed.map((item): ScenarioContent => {
    if (item.type === "prompt_component") {
      return {
        type: item.type,
        version: 1,
        id: item.id.trim() || nanoid(12),
        promptType: item.promptType,
        content: item.content.trim(),
      };
    }

    if (item.type === "story_card") {
      return {
        type: item.type,
        version: 1,
        id: item.id.trim() || nanoid(12),
        title: item.title.trim(),
        triggers: normalizeTriggers(item.triggers),
        content: item.content.trim(),
        category: normalizeStorybookCategory(item.category),
        isPinned: item.isPinned,
      };
    }

    if (item.type === "stat") {
      const min = Math.min(item.range[0], item.range[1]);
      const max = Math.max(item.range[0], item.range[1]);
      return {
        type: item.type,
        version: 1,
        id:
          item.id.trim() ||
          deterministicScenarioContentId("stat", item.name, 0),
        name: item.name.trim(),
        ...(trimmedOptional(item.description)
          ? { description: trimmedOptional(item.description) }
          : {}),
        value: Math.max(min, Math.min(item.value, max)),
        range: [min, max],
      };
    }

    return {
      type: item.type,
      version: 1,
      id:
        item.id.trim() ||
        deterministicScenarioContentId("inventory_item", item.name, 0),
      name: item.name.trim(),
      ...(trimmedOptional(item.description)
        ? { description: trimmedOptional(item.description) }
        : {}),
    };
  });
}

export function legacyScenarioToContent(
  scenario: ScenarioLegacyFields,
): ScenarioContent[] {
  const now = Date.now();
  const createdAt = scenario.createdAt ?? now;
  const updatedAt = scenario.updatedAt ?? now;
  const components = normalizePromptComponents(
    scenario.components ?? [
      {
        id: "legacy-plot",
        type: PromptComponentType.PLOT,
        content: scenario.description ?? scenario.initialDescription ?? "",
        createdAt,
        updatedAt,
      },
      {
        id: "legacy-author-note",
        type: PromptComponentType.AUTHOR_NOTE,
        content: scenario.initialAuthorNote ?? "",
        createdAt,
        updatedAt,
      },
      {
        id: "legacy-opening",
        type: PromptComponentType.OPENING,
        content: scenario.openingText ?? "",
        createdAt,
        updatedAt,
      },
    ],
    SCENARIO_COMPONENT_TYPES,
  );

  return normalizeScenarioContent([
    ...components.map((component) => ({
      type: "prompt_component" as const,
      version: 1 as const,
      id: component.id,
      promptType: component.type,
      content: component.content,
    })),
    ...(scenario.initialStoryCards ?? []).map((card) => ({
      type: "story_card" as const,
      version: 1 as const,
      id: card.id,
      title: card.title,
      triggers: card.triggers,
      content: card.content,
      category: card.category,
      isPinned: card.isPinned,
    })),
    ...(scenario.initialStats ?? []).map((stat, index) => ({
      type: "stat" as const,
      version: 1 as const,
      id: deterministicScenarioContentId("stat", stat.name, index),
      name: stat.name,
      description: stat.description,
      value: stat.value,
      range: stat.range,
    })),
    ...(scenario.initialInventory ?? []).map((name, index) => ({
      type: "inventory_item" as const,
      version: 1 as const,
      id: deterministicScenarioContentId("inventory_item", name, index),
      name,
    })),
  ]);
}

export function scenarioContentToEditorFields(
  content: ScenarioContent[],
  timestamp = Date.now(),
): ScenarioEditorFields {
  const normalized = normalizeScenarioContent(content);
  return {
    components: normalizePromptComponents(
      normalized
        .filter((item) => item.type === "prompt_component")
        .map((item) => ({
          id: item.id,
          type: item.promptType,
          content: item.content,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      SCENARIO_COMPONENT_TYPES,
    ),
    initialStats: normalized
      .filter((item) => item.type === "stat")
      .map((item) => ({
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        value: item.value,
        range: item.range,
      })),
    initialInventory: normalized
      .filter((item) => item.type === "inventory_item")
      .map((item) => item.name),
    initialStoryCards: normalized
      .filter((item) => item.type === "story_card")
      .map((item) =>
        normalizeStoryCard({
          id: item.id,
          title: item.title,
          triggers: item.triggers,
          content: item.content,
          category: item.category,
          isPinned: item.isPinned,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
  };
}

export function editorFieldsToScenarioContent(
  fields: ScenarioEditorFields,
): ScenarioContent[] {
  return legacyScenarioToContent(fields);
}

export function scenarioContentToTaleSeed(
  content: ScenarioContent[],
  timestamp = Date.now(),
): TaleSeed {
  const fields = scenarioContentToEditorFields(content, timestamp);
  const openingText =
    fields.components
      .find((component) => component.type === PromptComponentType.OPENING)
      ?.content.trim() ?? "";

  return {
    components: normalizePromptComponents(
      fields.components.filter((component) =>
        TALE_COMPONENT_TYPES.includes(
          component.type as (typeof TALE_COMPONENT_TYPES)[number],
        ),
      ),
      TALE_COMPONENT_TYPES,
    ),
    storyCards: fields.initialStoryCards.map(normalizeStoryCard),
    stats: fields.initialStats,
    inventory: normalizeScenarioContent(content)
      .filter((item) => item.type === "inventory_item")
      .map((item) => ({
        id: item.id,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
      })),
    openingText,
  };
}

export function scenarioContentToPackage(
  content: ScenarioContent[],
): ScenarioContent[] {
  return normalizeScenarioContent(content).filter((item) => {
    if (item.type === "prompt_component") return item.content.length > 0;
    if (item.type === "story_card") {
      return item.title.length > 0 && item.content.length > 0;
    }
    return item.name.length > 0;
  });
}

export function packageContentToScenarioContent(
  content: unknown,
): ScenarioContent[] {
  return scenarioContentToPackage(normalizeScenarioContent(content));
}

export function createEmptyScenarioContent(): ScenarioContent[] {
  return [];
}

export function defaultScenarioName(name: string | undefined) {
  return name?.trim() || "Untitled Scenario";
}

export function scenarioGameMode(value: string | undefined): GameMode {
  return value === GameMode.GM ? GameMode.GM : GameMode.STORY_TELLER;
}
