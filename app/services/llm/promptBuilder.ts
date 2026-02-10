import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import {
  ChatMessage,
  ChatRequest,
  ChatRequestOptions,
  LLMModel,
} from "./schema";
import {
  getActiveGmPrompt,
  getActiveStorytellerPrompt,
  getActiveContinueAuthorNote,
} from "@/prompts";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { GameMode, StoryCard, Item, ResponseMode } from "@/types";
import { toast } from "sonner";
import {
  assembleContextMessages,
  ensureDesiredLogEntriesLoaded,
  injectMode,
} from "./contextAssembly";

interface BuildMessageParams {
  log: LogEntry[];
  stats: Stat[];
  inventory: Item[];
  lastMessage: {
    text: string;
    mode: LogEntryMode;
  };
  description: string;
  authorNote: string;
  storyCards: StoryCard[];
  model: LLMModel;
  options?: ChatRequestOptions;
  gameMode: GameMode;
}

export async function buildMessage(
  params: BuildMessageParams,
): Promise<ChatRequest> {
  const {
    log: _log,
    stats,
    inventory,
    lastMessage,
    storyCards,
    model,
    description,
    authorNote,
    gameMode,
  } = params;

  const settings = useSettingsStore.getState();
  const contextLimit = Math.min(
    model.contextLength ?? settings.contextWindow,
    settings.contextWindow,
  );
  const completionMax = Math.max(0, settings.maxTokens);
  const promptBudget = Math.max(1, contextLimit - completionMax);

  const effectiveLogSource = await ensureDesiredLogEntriesLoaded(
    useTaleStore.getState,
  );

  const formatStats = (stats: Stat[]) =>
    stats
      .map((s) =>
        s.description
          ? `${s.name} (${s.value}/${s.range[1]}): ${s.description}`
          : `${s.name}: ${s.value}/${s.range[1]}`,
      )
      .join("\n  ");

  const formatInventory = (items: Item[]) =>
    items
      .map((i) => (i.description ? `${i.name}: ${i.description}` : i.name))
      .join("\n  ");

  const gameState = `
**Game State:**
- Stats:
  ${formatStats(stats)}
- Inventory:
  ${formatInventory(inventory)}
`;
  const userMessageContent = injectMode(lastMessage.text, lastMessage.mode);
  const userMessage =
    gameMode === GameMode.GM
      ? `${gameState}\n\n${userMessageContent}`
      : userMessageContent;
  const systemPrompt =
    gameMode === GameMode.GM
      ? getActiveGmPrompt()
      : getActiveStorytellerPrompt();

  const userMsg: ChatMessage = { role: "user", content: userMessage };
  const requiredMeta: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt} - ${description ? "\n\nThe story is: " + description : ""}`,
    },
  ];
  if (authorNote) requiredMeta.push({ role: "system", content: authorNote });
  if (lastMessage.mode === LogEntryMode.CONTINUE) {
    requiredMeta.push({
      role: "system",
      content: getActiveContinueAuthorNote(),
    });
  }

  const assembled = assembleContextMessages({
    log: effectiveLogSource,
    storyCards,
    requiredMeta,
    userMessage: userMsg,
    promptBudget,
    includeLogEntry: (entry) =>
      entry.role !== LogEntryRole.PLAYER || entry.text !== lastMessage.text,
    onRequiredTokensExceeded: (requiredTokens) => {
      toast.warning(
        `Context limit exceeded. Required messages use ${requiredTokens} tokens but only ${promptBudget} are available.`,
      );
    },
    onRequiredWithPinnedExceeded: (requiredTokens) => {
      toast.warning(
        `Context limit exceeded. Required messages and pinned cards use ${requiredTokens} tokens but only ${promptBudget} are available.`,
      );
    },
    onNoHistoryIncluded: () => {
      toast.warning(
        "No conversation history could be included due to token limits.",
      );
    },
  });

  return {
    model: model.id,
    messages: assembled.messages,
    stream: true,
    max_tokens: useSettingsStore.getState().maxTokens,
    options: params.options,
    // Automatic response mode: Tool calling for GM mode, free form for Story Teller mode
    responseMode:
      gameMode === GameMode.GM
        ? ResponseMode.TOOL_CALLING
        : ResponseMode.FREE_FORM,
  };
}
