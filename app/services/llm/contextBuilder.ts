import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { ChatMessage, LLMModel } from "./schema";
import { countMessageTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { StoryCard } from "@/types";
import { getActiveContinuePrompt } from "@/prompts";

function injectMode(text: string, mode?: LogEntryMode): string {
  if (mode === LogEntryMode.DIRECT) return `[Director's Note: ${text}]`;
  if (mode === LogEntryMode.STORY) return text;
  if (mode === LogEntryMode.DO) return `Action: ${text}`;
  if (mode === LogEntryMode.SAY) return `You say: "${text}"`;
  if (mode === LogEntryMode.CONTINUE) {
    return getActiveContinuePrompt();
  }
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

  const DESIRED_ENTRIES = 100;
  if (
    store.log.length < DESIRED_ENTRIES &&
    store.oldestLoadedIndex > 0 &&
    store.totalLogCount > store.log.length
  ) {
    await store.ensureLogEntriesLoaded(DESIRED_ENTRIES);
  }

  const effectiveLogSource = useTaleStore.getState().log;

  const tokenCountFor = (msgs: ChatMessage[]) => countMessageTokens(msgs);

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

  for (const entry of effectiveLogSource) {
    getEntryTokens(entry);
  }

  // Merge consecutive GM entries by chainId
  type Merged = { role: "user" | "assistant"; content: string };
  type AssistantMerged = Merged & { __chainKey: string };
  const mergedLog: Merged[] = [];

  for (const entry of effectiveLogSource) {
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

  // Always include pinned cards first
  const pinnedCards = storyCards.filter((card) => card.isPinned);
  const includedCardIds = new Set<string>(pinnedCards.map((c) => c.id));

  const selectedHistory: ChatMessage[] = [];

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

    const allIncludedCards = storyCards.filter((c) =>
      includedCardIds.has(c.id),
    );
    const tentativeCards = [...allIncludedCards, ...newCards];
    const tentativeContent = buildStoryBookPrompt(tentativeCards);
    const tentativeStoryBookMsg: ChatMessage | null = tentativeContent
      ? { role: "system", content: tentativeContent }
      : null;

    const msgsIfIncluded: ChatMessage[] = [...requiredMeta];
    if (tentativeStoryBookMsg) {
      msgsIfIncluded.push(tentativeStoryBookMsg);
    }
    msgsIfIncluded.push(...selectedHistory, chatMsg, userMsg);

    const totalTokensIfIncluded = tokenCountFor(msgsIfIncluded);

    if (totalTokensIfIncluded <= promptBudget) {
      selectedHistory.unshift(chatMsg);
      newCards.forEach((c) => includedCardIds.add(c.id));
    } else {
      break;
    }
  }

  const includedCards = storyCards.filter((c) => includedCardIds.has(c.id));
  const storyBookContentFinal = buildStoryBookPrompt(includedCards);
  const storyBookMsgFinal: ChatMessage | null = storyBookContentFinal
    ? { role: "system", content: storyBookContentFinal }
    : null;

  const messages: ChatMessage[] = [...requiredMeta];
  if (storyBookMsgFinal) messages.push(storyBookMsgFinal);
  messages.push(...selectedHistory);
  messages.push(userMsg);

  const usedTokens = tokenCountFor(messages);

  return {
    messages,
    promptBudget,
    usedTokens,
  };
}
