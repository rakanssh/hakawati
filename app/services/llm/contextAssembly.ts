import { getActiveContinuePrompt } from "@/prompts";
import { StoryCard } from "@/types";
import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { ChatMessage } from "./schema";
import { countMessageTokens } from "./tokenCounter";

const DEFAULT_DESIRED_LOG_ENTRIES = 100;

interface ContextWindowStore {
  log: LogEntry[];
  oldestLoadedIndex: number;
  totalLogCount: number;
  ensureLogEntriesLoaded: (minCount: number) => Promise<void>;
}

type MergedMessage = {
  role: "user" | "assistant";
  content: string;
  chainKey?: string;
};

export interface AssembleContextMessagesParams {
  log: LogEntry[];
  storyCards: StoryCard[];
  requiredMeta: ChatMessage[];
  userMessage: ChatMessage;
  promptBudget: number;
  includeLogEntry?: (entry: LogEntry) => boolean;
  onRequiredTokensExceeded?: (requiredTokens: number) => void;
  onRequiredWithPinnedExceeded?: (requiredTokens: number) => void;
  onNoHistoryIncluded?: () => void;
}

export interface AssembleContextMessagesResult {
  messages: ChatMessage[];
  usedTokens: number;
}

export async function ensureDesiredLogEntriesLoaded(
  getStore: () => ContextWindowStore,
  desiredEntries = DEFAULT_DESIRED_LOG_ENTRIES,
): Promise<LogEntry[]> {
  const store = getStore();
  if (
    store.log.length < desiredEntries &&
    store.oldestLoadedIndex > 0 &&
    store.totalLogCount > store.log.length
  ) {
    await store.ensureLogEntriesLoaded(desiredEntries);
  }
  return getStore().log;
}

export function injectMode(text: string, mode?: LogEntryMode): string {
  if (mode === LogEntryMode.DIRECT) return `[Director's Note: ${text}]`;
  if (mode === LogEntryMode.STORY) return text;
  if (mode === LogEntryMode.DO) return `Action: ${text}`;
  if (mode === LogEntryMode.SAY) return `You say: "${text}"`;
  if (mode === LogEntryMode.CONTINUE) return getActiveContinuePrompt();
  return text;
}

function getEntryTokens(entry: LogEntry): number {
  if (entry._tokenCount !== undefined) {
    return entry._tokenCount;
  }

  const content = injectMode(entry.text, entry.mode);
  const tokens = countMessageTokens([{ role: "user", content }]);
  entry._tokenCount = tokens;
  return tokens;
}

function collectCardsForText(
  text: string,
  storyCards: StoryCard[],
): StoryCard[] {
  const matched: StoryCard[] = [];
  const lcText = text.toLowerCase();

  for (const card of storyCards) {
    if (card.isPinned) continue;

    if (
      card.triggers.some(
        (trigger) => trigger && lcText.includes(trigger.toLowerCase()),
      )
    ) {
      if (!matched.find((existing) => existing.id === card.id)) {
        matched.push(card);
      }
    }
  }

  return matched;
}

function buildStoryBookPrompt(cards: StoryCard[]): string {
  if (!cards.length) return "";

  let output = "**StoryBook:**\n";
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    output += `\n${i + 1}. ${card.title}\n${card.content}\n`;
  }

  return output;
}

function mergeLogEntries(log: LogEntry[]): MergedMessage[] {
  const merged: MergedMessage[] = [];

  for (const entry of log) {
    const content = injectMode(entry.text, entry.mode);

    if (entry.role === LogEntryRole.GM) {
      const chainKey = entry.chainId ?? entry.id;
      const last = merged[merged.length - 1];

      if (last && last.role === "assistant" && last.chainKey === chainKey) {
        last.content += content;
      } else {
        merged.push({
          role: "assistant",
          content,
          chainKey,
        });
      }
    } else {
      merged.push({
        role: "user",
        content,
      });
    }
  }

  return merged;
}

export function assembleContextMessages(
  params: AssembleContextMessagesParams,
): AssembleContextMessagesResult {
  const {
    log,
    storyCards,
    requiredMeta,
    userMessage,
    promptBudget,
    includeLogEntry,
    onRequiredTokensExceeded,
    onRequiredWithPinnedExceeded,
    onNoHistoryIncluded,
  } = params;

  const tokenCountFor = (messages: ChatMessage[]) =>
    countMessageTokens(messages);
  const baseRequired = [...requiredMeta, userMessage];
  const requiredTokens = tokenCountFor(baseRequired);
  if (requiredTokens > promptBudget) {
    onRequiredTokensExceeded?.(requiredTokens);
  }

  const effectiveLog = includeLogEntry ? log.filter(includeLogEntry) : log;
  for (const entry of effectiveLog) {
    getEntryTokens(entry);
  }

  const mergedLog = mergeLogEntries(effectiveLog);

  const pinnedCards = storyCards.filter((card) => card.isPinned);
  const includedCardIds = new Set<string>(pinnedCards.map((card) => card.id));
  const pinnedStoryBookContent = buildStoryBookPrompt(pinnedCards);

  const baseWithPinned = [...baseRequired];
  if (pinnedStoryBookContent) {
    baseWithPinned.push({ role: "system", content: pinnedStoryBookContent });
  }

  const requiredWithPinned = tokenCountFor(baseWithPinned);
  if (requiredWithPinned > promptBudget) {
    onRequiredWithPinnedExceeded?.(requiredWithPinned);
  }

  const selectedHistory: ChatMessage[] = [];
  let hitTokenLimit = false;

  for (let i = mergedLog.length - 1; i >= 0; i--) {
    const message = mergedLog[i];

    if (
      message.role === "assistant" &&
      (message.content === "..." || message.content.trim() === "")
    ) {
      continue;
    }

    const chatMessage: ChatMessage = {
      role: message.role,
      content: message.content,
    };

    const matchedCards = collectCardsForText(message.content, storyCards);
    const newCards = matchedCards.filter(
      (card) => !includedCardIds.has(card.id),
    );

    const allIncludedCards = storyCards.filter((card) =>
      includedCardIds.has(card.id),
    );
    const tentativeCards = [...allIncludedCards, ...newCards];
    const tentativeStoryBookContent = buildStoryBookPrompt(tentativeCards);

    const messagesIfIncluded: ChatMessage[] = [...requiredMeta];
    if (tentativeStoryBookContent) {
      messagesIfIncluded.push({
        role: "system",
        content: tentativeStoryBookContent,
      });
    }
    messagesIfIncluded.push(...selectedHistory, chatMessage, userMessage);

    const totalTokens = tokenCountFor(messagesIfIncluded);
    if (totalTokens <= promptBudget) {
      selectedHistory.unshift(chatMessage);
      newCards.forEach((card) => includedCardIds.add(card.id));
    } else {
      hitTokenLimit = true;
      break;
    }
  }

  if (hitTokenLimit && selectedHistory.length === 0) {
    onNoHistoryIncluded?.();
  }

  const includedCards = storyCards.filter((card) =>
    includedCardIds.has(card.id),
  );
  const storyBookContent = buildStoryBookPrompt(includedCards);

  const messages: ChatMessage[] = [...requiredMeta];
  if (storyBookContent) {
    messages.push({ role: "system", content: storyBookContent });
  }
  messages.push(...selectedHistory);
  messages.push(userMessage);

  return {
    messages,
    usedTokens: tokenCountFor(messages),
  };
}
