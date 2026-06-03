import { resolveModelRole, sendRoleChat } from "@/services/llm";
import { ChatRequest } from "./schema";
import { StorybookCategory } from "@/types/context.type";
import { ResponseMode } from "@/types/api.type";
import { buildContext } from "./contextBuilder";
import { getActiveStoryCardGeneratorPrompt } from "@/prompts";

export interface GeneratedStoryCard {
  content: string;
  triggers: string[];
  category: StorybookCategory;
}

export async function generateStoryCard(
  title: string,
  signal?: AbortSignal,
): Promise<GeneratedStoryCard> {
  const { model } = resolveModelRole("utility");
  const context = await buildContext({
    model,
    systemPrompt: getActiveStoryCardGeneratorPrompt(),
    userMessage: `Create a story card for: "${title}"`,
    maxCompletionTokens: 500,
    includeAuthorNote: false,
  });

  const request: ChatRequest = {
    model: model.id,
    messages: context.messages,
    stream: false,
    max_tokens: 500,
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
    const parsed = JSON.parse(jsonStr);

    if (!parsed.content || typeof parsed.content !== "string") {
      throw new Error("Invalid response: missing content");
    }

    const triggers = Array.isArray(parsed.triggers)
      ? parsed.triggers.filter((t: unknown) => typeof t === "string")
      : [];

    const validCategories = Object.values(StorybookCategory);
    const category = validCategories.includes(parsed.category)
      ? parsed.category
      : StorybookCategory.UNCATEGORIZED;

    return {
      content: parsed.content,
      triggers,
      category,
    };
  } catch (e) {
    throw new Error(
      `Failed to parse story card response: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
  }
}
