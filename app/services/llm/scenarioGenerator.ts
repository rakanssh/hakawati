import { resolveModelRole, sendRoleChat } from "@/services/llm";
import type { ChatRequest, ChatMessage } from "./schema";
import { ResponseMode } from "@/types/api.type";
import { getActiveScenarioGeneratorPrompt } from "@/prompts";
import { nanoid } from "nanoid";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
} from "@/types/context.type";
import type { Scenario } from "@/types/context.type";
import { createPromptComponent } from "@/lib/prompt-components";
import { z } from "zod";

const GeneratedScenarioSchema = z.object({
  name: z.string(),
  initialGameMode: z.string(),
  description: z.string(),
  plot: z.string(),
  authorNote: z.string().optional().default(""),
  openingText: z.string().optional().default(""),
  initialStats: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      range: z.array(z.number()),
    }),
  ),
  initialInventory: z.array(z.string()),
  initialStoryCards: z.array(
    z.object({
      title: z.string(),
      triggers: z.array(z.string()),
      content: z.string(),
      category: z.string().optional(),
    }),
  ),
});

export async function generateScenario(
  userPrompt: string,
  signal?: AbortSignal,
): Promise<Scenario> {
  const { model } = resolveModelRole("utility");
  const messages: ChatMessage[] = [
    { role: "system", content: getActiveScenarioGeneratorPrompt() },
    { role: "user", content: userPrompt },
  ];

  const request: ChatRequest = {
    model: model.id,
    messages,
    stream: false,
    max_tokens: 4000,
    responseMode: ResponseMode.FREE_FORM,
  };

  const response = await sendRoleChat("utility", request, signal);
  const content = response.content.trim();

  let jsonStr = content;
  const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const raw = JSON.parse(jsonStr);
    const parsed = GeneratedScenarioSchema.parse(raw);

    const rawCards: Record<string, unknown>[] = Array.isArray(
      raw.initialStoryCards,
    )
      ? raw.initialStoryCards
      : [];
    const validCategories = Object.values(StorybookCategory) as string[];

    const now = Date.now();
    const validGameModes = Object.values(GameMode) as string[];
    const gameMode = validGameModes.includes(parsed.initialGameMode)
      ? (parsed.initialGameMode as GameMode)
      : GameMode.STORY_TELLER;

    const scenario: Scenario = {
      id: "",
      name: parsed.name,
      initialGameMode: gameMode,
      description: parsed.description,
      components: [
        createPromptComponent(PromptComponentType.PLOT, parsed.plot),
        createPromptComponent(
          PromptComponentType.AUTHOR_NOTE,
          parsed.authorNote,
        ),
        createPromptComponent(PromptComponentType.OPENING, parsed.openingText),
      ],
      initialStats: parsed.initialStats.map((s) => ({
        ...s,
        range: [s.range[0] ?? 0, s.range[1] ?? 100] as [number, number],
      })),
      initialInventory: parsed.initialInventory,
      initialStoryCards: parsed.initialStoryCards.map((card, i) => {
        const rawCat = rawCards[i]?.category;
        const category =
          typeof rawCat === "string" && validCategories.includes(rawCat)
            ? (rawCat as StorybookCategory)
            : StorybookCategory.UNCATEGORIZED;
        return {
          id: nanoid(12),
          title: card.title,
          triggers: card.triggers,
          content: card.content,
          category,
          isPinned: false,
          createdAt: now,
          updatedAt: now,
        };
      }),
      thumbnail: null,
    };

    return scenario;
  } catch (e) {
    throw new Error(
      `Failed to parse scenario response: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
  }
}
