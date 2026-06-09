import { nanoid } from "nanoid";
import { z } from "zod";
import { ResponseMode } from "@/types/api.type";
import { GameMode, StorybookCategory } from "@/types/context.type";
import type { StoryCard } from "@/types/context.type";
import type { Item } from "@/types/item.type";
import type { Stat } from "@/types/stats.type";
import { getActiveQuickstartTaleGeneratorPrompt } from "@/prompts";
import { resolveModelRole, sendRoleChat } from "@/services/llm";
import type { ChatMessage, ChatRequest } from "./schema";

export const QUICKSTART_AUTHOR_NOTE = `- use present tense and second person pronouns.
- show, don't simply tell. Using concrete sensory details over abstract descriptions.
- vary sentence rhythm for tension and atmosphere
- vary dialogue style and grammar to fit each character's personality
- do not make decisions for the player character
- keep responses short.`;

export type QuickstartTaleAnswers = {
  gameMode: GameMode;
  world: string;
  characterName: string;
  archetype: string;
  tone?: string;
  extraDetails?: string;
};

export type GeneratedQuickstartTale = {
  name: string;
  description: string;
  openingText: string;
  storyCards: StoryCard[];
  stats: Stat[];
  inventory: Item[];
};

const QuickstartStoryCardSchema = z.object({
  title: z.string(),
  triggers: z.array(z.string()).default([]),
  content: z.string(),
  category: z.string().optional(),
});

const QuickstartStatSchema = z.object({
  name: z.string(),
  value: z.number(),
  range: z.array(z.number()).optional(),
  description: z.string().optional(),
});

const QuickstartInventoryItemSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
]);

const QuickstartTaleResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  openingText: z.string(),
  storyCards: z.array(QuickstartStoryCardSchema).default([]),
  stats: z.array(QuickstartStatSchema).default([]),
  inventory: z.array(QuickstartInventoryItemSchema).default([]),
});

export function buildQuickstartTalePrompt(
  answers: QuickstartTaleAnswers,
): string {
  const parts = [
    "Generate a new quickstart tale from these guided answers.",
    "",
    `Game mode: ${answers.gameMode === GameMode.GM ? "Game Master" : "Story Teller"} (${answers.gameMode})`,
    `World: ${answers.world}`,
    `Player character name: ${answers.characterName}`,
    `Player character archetype: ${answers.archetype}`,
  ];

  const tone = answers.tone?.trim();
  if (tone) {
    parts.push(`Narrative tone: ${tone}`);
  }

  const extraDetails = answers.extraDetails?.trim();
  if (extraDetails) {
    parts.push(`Additional user details: ${extraDetails}`);
  }

  parts.push(
    "",
    "Runtime use of generated fields:",
    "- description is saved as the tale's persistent story context and sent to the model on future turns.",
    "- openingText is saved as the first visible tale entry and starts play immediately.",
    "- The user will not review the generated setup before play begins.",
    "",
    "The saved tale will use this fixed author note. Follow it when writing the description and openingText, but do not include an authorNote field in the JSON:",
    QUICKSTART_AUTHOR_NOTE,
  );

  return parts.join("\n");
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  return jsonMatch ? jsonMatch[1].trim() : trimmed;
}

function normalizeRange(range: number[] | undefined): [number, number] {
  return [range?.[0] ?? 0, range?.[1] ?? 100];
}

function normalizeCategory(category: string | undefined): StorybookCategory {
  const validCategories = Object.values(StorybookCategory) as string[];
  return category && validCategories.includes(category)
    ? (category as StorybookCategory)
    : StorybookCategory.UNCATEGORIZED;
}

function normalizeStoryCards(
  cards: z.infer<typeof QuickstartStoryCardSchema>[],
): StoryCard[] {
  const now = Date.now();
  return cards.map((card) => ({
    id: nanoid(12),
    title: card.title,
    triggers: card.triggers,
    content: card.content,
    category: normalizeCategory(card.category),
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  }));
}

function normalizeStats(stats: z.infer<typeof QuickstartStatSchema>[]): Stat[] {
  return stats.map((stat) => ({
    name: stat.name,
    value: stat.value,
    range: normalizeRange(stat.range),
    description: stat.description,
  }));
}

function normalizeInventory(
  inventory: z.infer<typeof QuickstartInventoryItemSchema>[],
): Item[] {
  return inventory.map((item) => {
    if (typeof item === "string") {
      return { id: nanoid(12), name: item };
    }
    return {
      id: nanoid(12),
      name: item.name,
      description: item.description,
    };
  });
}

export async function generateQuickstartTale(
  answers: QuickstartTaleAnswers,
  signal?: AbortSignal,
): Promise<GeneratedQuickstartTale> {
  const { model } = resolveModelRole("utility");
  const messages: ChatMessage[] = [
    { role: "system", content: getActiveQuickstartTaleGeneratorPrompt() },
    { role: "user", content: buildQuickstartTalePrompt(answers) },
  ];

  const request: ChatRequest = {
    model: model.id,
    messages,
    stream: false,
    max_tokens: 4000,
    responseMode: ResponseMode.FREE_FORM,
  };

  const response = await sendRoleChat("utility", request, signal);
  const jsonStr = extractJson(response.content);

  try {
    const parsed = QuickstartTaleResponseSchema.parse(JSON.parse(jsonStr));
    const isGm = answers.gameMode === GameMode.GM;

    return {
      name: parsed.name,
      description: parsed.description,
      openingText: parsed.openingText,
      storyCards: normalizeStoryCards(parsed.storyCards),
      stats: isGm ? normalizeStats(parsed.stats) : [],
      inventory: isGm ? normalizeInventory(parsed.inventory) : [],
    };
  } catch (e) {
    throw new Error(
      `Failed to parse quickstart tale response: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
  }
}
