import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import {
  ChatMessage,
  ChatRequest,
  ChatRequestOptions,
  LLMModel,
} from "./schema";
import {
  CONTINUE_AUTHOR_NOTE,
  CONTINUE_SYSTEM_PROMPT,
  GM_SYSTEM_PROMPT,
  STORY_TELLER_SYSTEM_PROMPT,
} from "@/prompts/system";
import { countMessageTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";
import { GameMode, StoryCard, Item, ResponseMode } from "@/types";
import { toast } from "sonner";

function collectCardsForText(
  text: string,
  storyCards: StoryCard[],
): StoryCard[] {
  const matched: StoryCard[] = [];
  const lcText = text.toLowerCase();
  for (const card of storyCards) {
    if (
      card.triggers.some(
        (trigger) => trigger && lcText.includes(trigger.toLowerCase()),
      )
    ) {
      if (!matched.find((c) => c.id === card.id)) {
        matched.push(card);
      }
    }
  }
  return matched;
}

function buildStoryBookPrompt(cards: StoryCard[]): string {
  if (!cards || cards.length === 0) return "";
  let out = "**StoryBook:**\n";
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    out += `\n${i + 1}. ${c.title}\n${c.content}\n`;
  }
  return out;
}

function injectMode(text: string, mode?: LogEntryMode): string {
  if (mode === LogEntryMode.DIRECT) return `[Director's Note: ${text}]`;
  if (mode === LogEntryMode.STORY) return text;
  if (mode === LogEntryMode.DO) return `Action: ${text}`;
  if (mode === LogEntryMode.SAY) return `You say: "${text}"`;
  if (mode === LogEntryMode.CONTINUE) {
    return CONTINUE_SYSTEM_PROMPT;
  }
  return text;
}

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
  responseMode: ResponseMode;
}

export function buildMessage(params: BuildMessageParams): ChatRequest {
  const {
    log,
    stats,
    inventory,
    lastMessage,
    storyCards,
    model,
    description,
    authorNote,
    gameMode,
    responseMode,
  } = params;

  const settings = useSettingsStore.getState();
  const contextLimit = Math.min(
    model.contextLength ?? settings.contextWindow,
    settings.contextWindow,
  );
  const completionMax = Math.max(0, settings.maxTokens);
  const promptBudget = Math.max(1, contextLimit - completionMax);
  const messages: ChatMessage[] = [];

  const gameState = `
**Game State:**
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory.map((item) => item.name))}
`;
  const userMessageContent = injectMode(lastMessage.text, lastMessage.mode);
  const userMessage =
    gameMode === GameMode.GM
      ? `${gameState}\n\n${userMessageContent}`
      : userMessageContent;
  const systemPrompt =
    gameMode === GameMode.GM ? GM_SYSTEM_PROMPT : STORY_TELLER_SYSTEM_PROMPT;

  const userMsg: ChatMessage = { role: "user", content: userMessage };

  const tokenCountFor = (msgs: ChatMessage[]) => countMessageTokens(msgs);

  // Build required meta messages in fixed priority order (without the current user message)
  const requiredMeta: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];
  if (description) requiredMeta.push({ role: "system", content: description });
  if (authorNote) requiredMeta.push({ role: "system", content: authorNote });
  if (lastMessage.mode === LogEntryMode.CONTINUE) {
    requiredMeta.push({ role: "system", content: CONTINUE_AUTHOR_NOTE });
  }

  // For budgeting, the current user message is also required
  const baseRequiredForCounting: ChatMessage[] = [...requiredMeta, userMsg];

  // Check if required messages exceed the prompt budget
  const requiredTokens = tokenCountFor(baseRequiredForCounting);
  if (requiredTokens > promptBudget) {
    toast.warning(
      `Context limit exceeded. Required messages use ${requiredTokens} tokens but only ${promptBudget} are available.`,
    );
  }

  // Filter out last user message
  const effectiveLog = log.filter(
    (entry) =>
      entry.role !== LogEntryRole.PLAYER || entry.text !== lastMessage.text,
  );

  // Merge consecutive GM entries by chainId
  type Merged = { role: "user" | "assistant"; content: string };
  type AssistantMerged = Merged & { __chainKey: string };
  const mergedLog: Merged[] = [];
  for (const entry of effectiveLog) {
    const content = injectMode(entry.text, entry.mode);
    if (entry.role === LogEntryRole.GM) {
      const chainKey = entry.chainId ?? entry.id;
      const last = mergedLog[mergedLog.length - 1] as
        | AssistantMerged
        | undefined;
      if (last && last.role === "assistant" && last.__chainKey === chainKey) {
        last.content += content;
      } else {
        const merged: AssistantMerged = {
          role: "assistant",
          content,
          __chainKey: chainKey,
        };
        mergedLog.push(merged);
      }
    } else {
      mergedLog.push({ role: "user", content });
    }
  }

  const selectedHistory: ChatMessage[] = [];
  const includedCardIds = new Set<string>();
  let hitTokenLimit = false;

  const currentBaseMessages = [...baseRequiredForCounting];

  for (let i = mergedLog.length - 1; i >= 0; i--) {
    const msg = mergedLog[i];
    if (
      msg.role === "assistant" &&
      (msg.content === "..." || msg.content.trim() === "")
    ) {
      continue;
    }

    const chatMsg: ChatMessage = { role: msg.role, content: msg.content };

    const matched = collectCardsForText(msg.content, storyCards);
    const newCards = matched.filter((c) => !includedCardIds.has(c.id));

    const tentativeCardList = [
      ...storyCards.filter((c) => includedCardIds.has(c.id)),
      ...newCards,
    ];

    const storyBookContent = buildStoryBookPrompt(tentativeCardList);
    const storyBookMsg: ChatMessage | null = storyBookContent
      ? { role: "system", content: storyBookContent }
      : null;

    const msgsIfIncluded = [...currentBaseMessages, ...selectedHistory];
    if (storyBookMsg) msgsIfIncluded.push(storyBookMsg);
    msgsIfIncluded.push(chatMsg);

    const totalTokensIfIncluded = tokenCountFor(msgsIfIncluded);

    if (totalTokensIfIncluded <= promptBudget) {
      selectedHistory.unshift(chatMsg);
      for (const c of newCards) includedCardIds.add(c.id);
    } else {
      // Cannot include this message because adding it (and any new cards) would exceed budget
      hitTokenLimit = true;
      break;
    }
  }

  if (hitTokenLimit && selectedHistory.length === 0) {
    toast.warning(
      "No conversation history could be included due to token limits.",
    );
  }

  // Prepare StoryBook system message for later inclusion
  const includedCards = storyCards.filter((c) => includedCardIds.has(c.id));
  const storyBookContentFinal = buildStoryBookPrompt(includedCards);
  const storyBookMsgFinal: ChatMessage | null = storyBookContentFinal
    ? { role: "system", content: storyBookContentFinal }
    : null;

  // Final assembly: meta, StoryBook (if any), history, then the current user message LAST
  messages.length = 0;
  messages.push(...requiredMeta);
  if (storyBookMsgFinal) messages.push(storyBookMsgFinal);
  messages.push(...selectedHistory);
  messages.push(userMsg);

  return {
    model: model.id,
    messages,
    stream: true,
    max_tokens: useSettingsStore.getState().maxTokens,
    options: params.options,
    responseMode:
      gameMode === GameMode.GM ? responseMode : ResponseMode.FREE_FORM,
  };
}
