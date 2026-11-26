import { ChatMessage } from "./schema";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { getPromptComponentContent } from "@/lib/prompt-components";
import { LLMModel, PromptComponentType } from "@/types";
import { ensureDesiredLogEntriesLoaded } from "./contextAssembly";
import { assembleStoryContext } from "./recapContext";

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
 * Builds context messages including AI-facing tale components, story cards, and conversation history.
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
  const { components, storyCards } = store;

  const contextLimit = Math.min(
    model.contextLength ?? settings.contextWindow,
    settings.contextWindow,
  );
  const completionMax = maxCompletionTokens ?? Math.max(0, settings.maxTokens);
  const promptBudget = Math.max(1, contextLimit - completionMax);

  await ensureDesiredLogEntriesLoaded(useTaleStore.getState);
  const taleState = useTaleStore.getState();
  const effectiveLogSource = taleState.log;

  // Build required meta messages
  const plot = getPromptComponentContent(components, PromptComponentType.PLOT);
  const authorNote = getPromptComponentContent(
    components,
    PromptComponentType.AUTHOR_NOTE,
  );

  const requiredMeta: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];
  if (plot) {
    requiredMeta.push({ role: "system", content: `**Plot:**\n${plot}` });
  }

  const lateMeta: ChatMessage[] = [];
  if (includeAuthorNote && authorNote) {
    lateMeta.push({
      role: "system",
      content: `**Author's Note:**\n${authorNote}`,
    });
  }

  for (const msg of additionalSystemMessages) {
    requiredMeta.push({ role: "system", content: msg });
  }

  const userMsg: ChatMessage = { role: "user", content: userMessage };
  const assembled = await assembleStoryContext(
    {
      log: effectiveLogSource,
      storyCards,
      requiredMeta,
      lateMeta,
      userMessage: userMsg,
      promptBudget,
    },
    {
      taleId: taleState.id,
      oldestLoadedIndex: taleState.oldestLoadedIndex,
      isNarrator: false,
    },
  );

  return {
    messages: assembled.messages,
    promptBudget,
    usedTokens: assembled.usedTokens,
  };
}
