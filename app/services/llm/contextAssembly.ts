import { getActiveContinuePrompt } from "@/prompts";
import { ensureLogEntriesLoaded } from "@/services/tale-log";
import { StoryCard } from "@/types";
import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { ChatMessage } from "./schema";
import { countMessageTokens } from "./tokenCounter";

const DEFAULT_DESIRED_LOG_ENTRIES = 100;

interface ContextWindowStore {
  log: LogEntry[];
  oldestLoadedIndex: number;
  totalLogCount: number;
}

type MergedMessage = {
  role: "user" | "assistant";
  content: string;
  chainKey?: string;
  firstEntry: LogEntry;
};

export interface AssembleContextMessagesParams {
  log: LogEntry[];
  storyCards: StoryCard[];
  requiredMeta: ChatMessage[];
  lateMeta?: ChatMessage[];
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
    await ensureLogEntriesLoaded(desiredEntries);
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

// Per message, not per entry: a GM chain's joined text tokenizes differently.
const historyTokenCache = new WeakMap<
  LogEntry,
  Pick<MergedMessage, "role" | "content"> & { tokens: number }
>();

function getHistoryMessageTokens(message: MergedMessage): number {
  const cached = historyTokenCache.get(message.firstEntry);
  if (cached?.role === message.role && cached.content === message.content) {
    return cached.tokens;
  }

  const tokens = countMessageTokens([
    { role: message.role, content: message.content },
  ]);
  historyTokenCache.set(message.firstEntry, {
    role: message.role,
    content: message.content,
    tokens,
  });
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

function countStoryBookTokens(cards: StoryCard[]): number {
  const content = buildStoryBookPrompt(cards);
  return content ? countMessageTokens([{ role: "system", content }]) : 0;
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
          firstEntry: entry,
        });
      }
    } else {
      merged.push({
        role: "user",
        content,
        firstEntry: entry,
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
    lateMeta = [],
    userMessage,
    promptBudget,
    includeLogEntry,
    onRequiredTokensExceeded,
    onRequiredWithPinnedExceeded,
    onNoHistoryIncluded,
  } = params;

  const requiredTokens = countMessageTokens([
    ...requiredMeta,
    ...lateMeta,
    userMessage,
  ]);
  if (requiredTokens > promptBudget) {
    onRequiredTokensExceeded?.(requiredTokens);
  }

  const effectiveLog = includeLogEntry ? log.filter(includeLogEntry) : log;
  const mergedLog = mergeLogEntries(effectiveLog);

  const pinnedCards = storyCards.filter((card) => card.isPinned);
  const includedCardIds = new Set<string>(pinnedCards.map((card) => card.id));

  const requiredWithPinned = requiredTokens + countStoryBookTokens(pinnedCards);
  if (requiredWithPinned > promptBudget) {
    onRequiredWithPinnedExceeded?.(requiredWithPinned);
  }

  let includedCards = storyCards.filter((card) => includedCardIds.has(card.id));
  let storyBookTokens = countStoryBookTokens(includedCards);
  let historyTokens = 0;
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

    const matchedCards = collectCardsForText(message.content, storyCards);
    const newCards = matchedCards.filter(
      (card) => !includedCardIds.has(card.id),
    );
    const tentativeStoryBookTokens =
      newCards.length > 0
        ? countStoryBookTokens([...includedCards, ...newCards])
        : storyBookTokens;
    const messageTokens = getHistoryMessageTokens(message);

    const totalTokens =
      requiredTokens + tentativeStoryBookTokens + historyTokens + messageTokens;
    if (totalTokens <= promptBudget) {
      selectedHistory.unshift({ role: message.role, content: message.content });
      historyTokens += messageTokens;
      if (newCards.length > 0) {
        newCards.forEach((card) => includedCardIds.add(card.id));
        includedCards = storyCards.filter((card) =>
          includedCardIds.has(card.id),
        );
        storyBookTokens = countStoryBookTokens(includedCards);
      }
    } else {
      hitTokenLimit = true;
      break;
    }
  }

  if (hitTokenLimit && selectedHistory.length === 0) {
    onNoHistoryIncluded?.();
  }

  const storyBookContent = buildStoryBookPrompt(includedCards);

  const messages: ChatMessage[] = [...requiredMeta];
  if (storyBookContent) {
    messages.push({ role: "system", content: storyBookContent });
  }
  messages.push(...selectedHistory);
  messages.push(...lateMeta);
  messages.push(userMessage);

  return {
    messages,
    usedTokens: requiredTokens + storyBookTokens + historyTokens,
  };
}
