import { ChatMessage, LLMModel } from "./schema";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  assembleContextMessages,
  ensureDesiredLogEntriesLoaded,
} from "./contextAssembly";

export interface ContextBuildParams {
  model: LLMModel;
  systemPrompt: string;
  userMessage: string;
  additionalSystemMessages?: string[];
  maxCompletionTokens?: number;
  includeAuthorNote?: boolean;
}

export interface BuiltContext {
  messages: ChatMessage[];
  promptBudget: number;
  usedTokens: number;
}

/**
 * Builds context messages including tale description, author note, story cards, and conversation history.
 * Respects token budget and prioritizes recent messages.
 */
export async function buildContext(
  params: ContextBuildParams,
): Promise<BuiltContext> {
  const {
    model,
    systemPrompt,
    userMessage,
    additionalSystemMessages = [],
    maxCompletionTokens,
    includeAuthorNote = true,
  } = params;

  const settings = useSettingsStore.getState();
  const store = useTaleStore.getState();
  const { description, authorNote, storyCards } = store;

  const contextLimit = Math.min(
    model.contextLength ?? settings.contextWindow,
    settings.contextWindow,
  );
  const completionMax = maxCompletionTokens ?? Math.max(0, settings.maxTokens);
  const promptBudget = Math.max(1, contextLimit - completionMax);

  const effectiveLogSource = await ensureDesiredLogEntriesLoaded(
    useTaleStore.getState,
  );

  // Build required meta messages
  const requiredMeta: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}${description ? "\n\n**Story Setting:**\n" + description : ""}`,
    },
  ];

  if (includeAuthorNote && authorNote) {
    requiredMeta.push({
      role: "system",
      content: `**Author Notes:**\n${authorNote}`,
    });
  }

  for (const msg of additionalSystemMessages) {
    requiredMeta.push({ role: "system", content: msg });
  }

  const userMsg: ChatMessage = { role: "user", content: userMessage };
  const assembled = assembleContextMessages({
    log: effectiveLogSource,
    storyCards,
    requiredMeta,
    userMessage: userMsg,
    promptBudget,
  });

  return {
    messages: assembled.messages,
    promptBudget,
    usedTokens: assembled.usedTokens,
  };
}
