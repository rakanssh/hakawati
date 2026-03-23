import { sendChat } from "@/services/llm";
import type { ChatRequest, ChatMessage, LLMModel } from "./schema";
import { ResponseMode } from "@/types/api.type";
import { ScenarioExportDataV1Schema } from "@/types/export.type";
import { getActiveScenarioGeneratorPrompt } from "@/prompts";
import { nanoid } from "nanoid";
import { GameMode, StorybookCategory } from "@/types/context.type";
import type { Scenario } from "@/types/context.type";

export async function generateScenario(
  userPrompt: string,
  model: LLMModel,
  signal?: AbortSignal,
): Promise<Scenario> {
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

  const response = await sendChat(request, signal);
  const content = response.content.trim();

  let jsonStr = content;
  const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = ScenarioExportDataV1Schema.parse(JSON.parse(jsonStr));

    const now = Date.now();
    const validGameModes = Object.values(GameMode) as string[];
    const gameMode = validGameModes.includes(parsed.initialGameMode)
      ? (parsed.initialGameMode as GameMode)
      : GameMode.STORY_TELLER;

    const scenario: Scenario = {
      id: "",
      name: parsed.name,
      initialGameMode: gameMode,
      initialDescription: parsed.initialDescription,
      initialAuthorNote: parsed.initialAuthorNote,
      initialStats: parsed.initialStats.map((s) => ({
        ...s,
        range: [s.range[0] ?? 0, s.range[1] ?? 100] as [number, number],
      })),
      initialInventory: parsed.initialInventory,
      initialStoryCards: parsed.initialStoryCards.map((card) => ({
        id: nanoid(12),
        title: card.title,
        triggers: card.triggers,
        content: card.content,
        category: StorybookCategory.UNCATEGORIZED,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      })),
      openingText: parsed.openingText,
      thumbnail: null,
    };

    return scenario;
  } catch (e) {
    throw new Error(
      `Failed to parse scenario response: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
  }
}
