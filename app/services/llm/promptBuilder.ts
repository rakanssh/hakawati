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
import { getPromptComponentContent } from "@/lib/prompt-components";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  GameMode,
  PromptComponent,
  PromptComponentType,
  StoryCard,
  Item,
  ResponseMode,
} from "@/types";
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
  components?: PromptComponent[];
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
    components = [],
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

  const statsBlock =
    stats.length === 0 ? "- Stats: []" : `- Stats:\n  ${formatStats(stats)}`;
  const inventoryBlock =
    inventory.length === 0
      ? "- Inventory: []"
      : `- Inventory:\n  ${formatInventory(inventory)}`;

  const gameState = `
**Game State:**
${statsBlock}
${inventoryBlock}
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
  const aiInstructions =
    getPromptComponentContent(
      components,
      PromptComponentType.AI_INSTRUCTIONS,
    ) || getActiveStorytellerPrompt();
  const plot = getPromptComponentContent(components, PromptComponentType.PLOT);
  const authorNote = getPromptComponentContent(
    components,
    PromptComponentType.AUTHOR_NOTE,
  );
  const requiredMeta: ChatMessage[] = [
    {
      role: "system",
      content: aiInstructions,
    },
  ];
  if (gameMode === GameMode.GM) {
    requiredMeta.push({ role: "system", content: systemPrompt });
  }
  if (plot) {
    requiredMeta.push({ role: "system", content: `**Plot:**\n${plot}` });
  }
  const lateMeta: ChatMessage[] = [];
  if (authorNote) {
    lateMeta.push({
      role: "system",
      content: `**Author's Note:**\n${authorNote}`,
    });
  }
  if (lastMessage.mode === LogEntryMode.CONTINUE) {
    lateMeta.push({
      role: "system",
      content: `**Continue Note:**\n${getActiveContinueAuthorNote()}`,
    });
  }

  const assembled = assembleContextMessages({
    log: effectiveLogSource,
    storyCards,
    requiredMeta,
    lateMeta,
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
