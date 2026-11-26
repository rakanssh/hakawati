import { getActiveContinuePrompt } from "@/prompts";
import { formatRecapBlock, isRecapPassage, readRecap } from "@/lib/recaps";
import { ensureLogEntriesLoaded } from "@/services/tale-log";
import { StoryCard } from "@/types";
import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { ChatMessage } from "./schema";
import { countMessageTokens, countTokens } from "./tokenCounter";

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
  currentText?: string;
  promptBudget: number;
  includeLogEntry?: (entry: LogEntry) => boolean;
  onRequiredTokensExceeded?: (requiredTokens: number) => void;
  onRequiredWithPinnedExceeded?: (requiredTokens: number) => void;
  onNoHistoryIncluded?: () => void;
  recaps?: RecapContextOptions;
}

export interface RecapContextOptions {
  share: number;
  /** Recaps of entries before `log`, newest first. */
  older?: readonly { lines: readonly string[] }[];
}

export interface RecapContextReport {
  historyBudget: number;
  needsOlderRecaps: boolean;
}

export interface AssembleContextMessagesResult {
  messages: ChatMessage[];
  usedTokens: number;
  recap?: RecapContextReport;
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

interface BaseCards {
  requiredTokens: number;
  requiredWithPinned: number;
  includedCardIds: Set<string>;
  includedCards: StoryCard[];
  storyBookTokens: number;
}

function selectBaseCards(params: AssembleContextMessagesParams): BaseCards {
  const {
    storyCards,
    requiredMeta,
    lateMeta = [],
    userMessage,
    currentText,
    promptBudget,
  } = params;

  const requiredTokens = countMessageTokens([
    ...requiredMeta,
    ...lateMeta,
    userMessage,
  ]);

  const pinnedCards = storyCards.filter((card) => card.isPinned);
  const includedCardIds = new Set<string>(pinnedCards.map((card) => card.id));
  const requiredWithPinned = requiredTokens + countStoryBookTokens(pinnedCards);

  let includedCards = storyCards.filter((card) => includedCardIds.has(card.id));
  let storyBookTokens = countStoryBookTokens(includedCards);

  const currentCards = currentText
    ? collectCardsForText(currentText, storyCards).filter(
        (card) => !includedCardIds.has(card.id),
      )
    : [];
  if (
    currentCards.length > 0 &&
    requiredTokens +
      countStoryBookTokens([...includedCards, ...currentCards]) <=
      promptBudget
  ) {
    currentCards.forEach((card) => includedCardIds.add(card.id));
    includedCards = storyCards.filter((card) => includedCardIds.has(card.id));
    storyBookTokens = countStoryBookTokens(includedCards);
  }

  return {
    requiredTokens,
    requiredWithPinned,
    includedCardIds,
    includedCards,
    storyBookTokens,
  };
}

interface HistoryAssembly extends AssembleContextMessagesResult {
  hitTokenLimit: boolean;
  historyCount: number;
}

export function assembleContextMessages(
  params: AssembleContextMessagesParams,
): AssembleContextMessagesResult {
  const {
    promptBudget,
    recaps,
    onRequiredTokensExceeded,
    onRequiredWithPinnedExceeded,
    onNoHistoryIncluded,
  } = params;

  const base = selectBaseCards(params);
  if (base.requiredTokens > promptBudget) {
    onRequiredTokensExceeded?.(base.requiredTokens);
  }
  if (base.requiredWithPinned > promptBudget) {
    onRequiredWithPinnedExceeded?.(base.requiredWithPinned);
  }

  const whole = assembleWholeHistory(params, base);
  const historyBudget = Math.max(
    0,
    promptBudget - base.requiredTokens - base.storyBookTokens,
  );
  const withRecaps =
    recaps && whole.hitTokenLimit
      ? assembleWithRecaps(params, selectBaseCards(params), recaps)
      : null;
  const chosen = withRecaps ?? whole;

  if (chosen.hitTokenLimit && chosen.historyCount === 0) {
    onNoHistoryIncluded?.();
  }

  const result: AssembleContextMessagesResult = {
    messages: chosen.messages,
    usedTokens: chosen.usedTokens,
  };
  if (recaps) {
    result.recap = {
      historyBudget,
      needsOlderRecaps: withRecaps
        ? withRecaps.needsOlderRecaps
        : whole.hitTokenLimit && !recaps.older,
    };
  }
  return result;
}

function assembleWholeHistory(
  params: AssembleContextMessagesParams,
  base: BaseCards,
): HistoryAssembly {
  const {
    log,
    storyCards,
    requiredMeta,
    lateMeta = [],
    userMessage,
    promptBudget,
    includeLogEntry,
  } = params;
  const { requiredTokens, includedCardIds } = base;
  let { includedCards, storyBookTokens } = base;

  const effectiveLog = includeLogEntry ? log.filter(includeLogEntry) : log;
  const mergedLog = mergeLogEntries(effectiveLog);

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
    hitTokenLimit,
    historyCount: selectedHistory.length,
  };
}

type EntryUnit = {
  role: "user" | "assistant";
  content: string;
  chainKey?: string;
  entry: LogEntry;
};

const entryTokenCache = new WeakMap<
  LogEntry,
  { role: string; content: string; tokens: number }
>();

function toEntryUnit(entry: LogEntry): EntryUnit {
  const content = injectMode(entry.text, entry.mode);
  return entry.role === LogEntryRole.GM
    ? { role: "assistant", content, chainKey: entry.chainId ?? entry.id, entry }
    : { role: "user", content, entry };
}

function countUnitTokens(unit: EntryUnit): number {
  const cached = entryTokenCache.get(unit.entry);
  if (cached?.role === unit.role && cached.content === unit.content) {
    return cached.tokens;
  }
  const tokens = countMessageTokens([
    { role: unit.role, content: unit.content },
  ]);
  entryTokenCache.set(unit.entry, {
    role: unit.role,
    content: unit.content,
    tokens,
  });
  return tokens;
}

export function countEntryTokens(entry: LogEntry): number {
  return countUnitTokens(toEntryUnit(entry));
}

const recapTokenCache = new Map<string, number>();
const RECAP_TOKEN_CACHE_LIMIT = 20_000;

export function countRecapTokens(lines: readonly string[]): number {
  if (lines.length === 0) return 0;
  const text = lines.map((line) => `- ${line}`).join("\n");
  let tokens = recapTokenCache.get(text);
  if (tokens === undefined) {
    tokens = countTokens(text) + 1;
    if (recapTokenCache.size >= RECAP_TOKEN_CACHE_LIMIT) {
      recapTokenCache.clear();
    }
    recapTokenCache.set(text, tokens);
  }
  return tokens;
}

let recapBlockOverhead: number | undefined;
export function getRecapBlockOverhead(): number {
  recapBlockOverhead ??= countMessageTokens([
    { role: "system", content: formatRecapBlock([]) },
  ]);
  return recapBlockOverhead;
}

function isEmptyNarration(unit: EntryUnit): boolean {
  return (
    unit.role === "assistant" &&
    (unit.content === "..." || unit.content.trim() === "")
  );
}

function joinVerbatimUnits(units: EntryUnit[]): ChatMessage[] {
  const messages: Array<ChatMessage & { chainKey?: string }> = [];
  for (const unit of units) {
    const last = messages.at(-1);
    if (
      unit.role === "assistant" &&
      last?.role === "assistant" &&
      last.chainKey === unit.chainKey
    ) {
      last.content += unit.content;
    } else {
      messages.push({
        role: unit.role,
        content: unit.content,
        chainKey: unit.chainKey,
      });
    }
  }
  return messages.map(({ role, content }) => ({ role, content }));
}

type RecapUnit = { lines: readonly string[]; tokens: number };

function assembleWithRecaps(
  params: AssembleContextMessagesParams,
  base: BaseCards,
  options: RecapContextOptions,
): (HistoryAssembly & { needsOlderRecaps: boolean }) | null {
  const {
    log,
    storyCards,
    requiredMeta,
    lateMeta = [],
    userMessage,
    promptBudget,
    includeLogEntry,
  } = params;
  const effectiveLog = includeLogEntry ? log.filter(includeLogEntry) : log;

  let boundary = -1;
  for (let i = effectiveLog.length - 1; i >= 0; i--) {
    const entry = effectiveLog[i];
    if (isRecapPassage(entry) && readRecap(entry) !== undefined) {
      boundary = i;
      break;
    }
  }
  const older = options.older ?? [];
  if (boundary === -1 && older.length === 0) return null;

  const recapUnits: RecapUnit[] = [];
  for (let i = boundary; i >= 0; i--) {
    const entry = effectiveLog[i];
    if (!isRecapPassage(entry)) continue;
    const lines = readRecap(entry);
    if (lines?.length) {
      recapUnits.push({ lines, tokens: countRecapTokens(lines) });
    }
  }
  for (const stored of older) {
    if (stored.lines.length) {
      recapUnits.push({
        lines: stored.lines,
        tokens: countRecapTokens(stored.lines),
      });
    }
  }

  const { requiredTokens, includedCardIds } = base;
  let { includedCards, storyBookTokens } = base;
  const historyLimit = promptBudget - requiredTokens;
  const historyBudget = Math.max(0, historyLimit - storyBookTokens);
  const blockOverhead = getRecapBlockOverhead();

  const reserveTarget = Math.floor(options.share * historyBudget);
  let availableRecapTokens = recapUnits.length > 0 ? blockOverhead : 0;
  for (const unit of recapUnits) {
    if (availableRecapTokens >= reserveTarget) break;
    availableRecapTokens += unit.tokens;
  }
  const reserve = Math.min(reserveTarget, availableRecapTokens);

  const admitCards = (text: string, historyTokens: number, limit: number) => {
    const newCards = collectCardsForText(text, storyCards).filter(
      (card) => !includedCardIds.has(card.id),
    );
    const nextStoryBookTokens =
      newCards.length > 0
        ? countStoryBookTokens([...includedCards, ...newCards])
        : storyBookTokens;
    if (nextStoryBookTokens + historyTokens > limit) return false;
    if (newCards.length > 0) {
      newCards.forEach((card) => includedCardIds.add(card.id));
      includedCards = storyCards.filter((card) => includedCardIds.has(card.id));
      storyBookTokens = nextStoryBookTokens;
    }
    return true;
  };

  const verbatimCandidates: EntryUnit[] = [];
  for (let i = effectiveLog.length - 1; i > boundary; i--) {
    const unit = toEntryUnit(effectiveLog[i]);
    if (!isEmptyNarration(unit)) verbatimCandidates.push(unit);
  }

  const selectedVerbatim: EntryUnit[] = [];
  const selectedRecaps: RecapUnit[] = [];
  let verbatimTokens = 0;
  let recapTokens = 0;
  let nextVerbatim = 0;

  const fillVerbatim = (limit: number) => {
    while (nextVerbatim < verbatimCandidates.length) {
      const unit = verbatimCandidates[nextVerbatim];
      const tokens =
        countUnitTokens(unit) + (selectedVerbatim.length > 0 ? 1 : 0);
      if (
        !admitCards(unit.content, verbatimTokens + recapTokens + tokens, limit)
      ) {
        return;
      }
      selectedVerbatim.unshift(unit);
      verbatimTokens += tokens;
      nextVerbatim += 1;
    }
  };

  fillVerbatim(historyLimit - reserve);

  let recapsExhausted = true;
  for (const unit of recapUnits) {
    const tokens =
      unit.tokens + (selectedRecaps.length === 0 ? blockOverhead : 0);
    if (
      !admitCards(
        unit.lines.join(" "),
        verbatimTokens + recapTokens + tokens,
        historyLimit,
      )
    ) {
      recapsExhausted = false;
      break;
    }
    selectedRecaps.unshift(unit);
    recapTokens += tokens;
  }

  fillVerbatim(historyLimit);

  const messages: ChatMessage[] = [...requiredMeta];
  const storyBookContent = buildStoryBookPrompt(includedCards);
  if (storyBookContent) {
    messages.push({ role: "system", content: storyBookContent });
  }
  if (selectedRecaps.length > 0) {
    messages.push({
      role: "system",
      content: formatRecapBlock(selectedRecaps.flatMap((unit) => unit.lines)),
    });
  }
  messages.push(...joinVerbatimUnits(selectedVerbatim));
  messages.push(...lateMeta);
  messages.push(userMessage);

  const usedTokens =
    requiredTokens + storyBookTokens + verbatimTokens + recapTokens;
  return {
    messages,
    usedTokens,
    hitTokenLimit: nextVerbatim < verbatimCandidates.length,
    historyCount: selectedVerbatim.length,
    needsOlderRecaps:
      recapsExhausted && promptBudget - usedTokens > blockOverhead,
  };
}
