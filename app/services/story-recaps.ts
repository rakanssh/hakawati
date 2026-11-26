import { toast } from "sonner";
import { isAbortError } from "@/lib/errors";
import { getPromptComponentContent } from "@/lib/prompt-components";
import { isRecapPassage, readRecap, type RecapWrite } from "@/lib/recaps";
import { setLogEntryRecaps } from "@/repositories/tale.repository";
import { isTaleInPlay } from "@/services/open-tale-sync";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import {
  countEntryTokens,
  countRecapTokens,
} from "@/services/llm/contextAssembly";
import {
  getRecapBudget,
  storyRecapsEnabled,
} from "@/services/llm/recapContext";
import {
  generateRecaps,
  recapInputBudget,
  RecapParseError,
  type RecapRangeEntry,
  type RecapRequest,
} from "@/services/llm/recapGenerator";
import { usePlayActivityStore } from "@/store/usePlayActivityStore";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { LogEntry, LogEntryRole } from "@/types/log.type";
import { PromptComponentType } from "@/types/context.type";

export const MIN_VERBATIM_PASSAGES = 4;
const HIGH_WATER = 0.85;
const LOW_WATER = 0.5;
const MIN_BATCH = 3;
const MAX_BATCH = 40;
const HORIZON_FACTOR = 1.25;
const ESTIMATED_RECAP_RATIO = 0.12;
const MIN_ESTIMATED_RECAP_TOKENS = 12;
const REQUEST_OVERHEAD_TOKENS = 700;
const STORY_SO_FAR_SHARE = 0.25;
const STORY_SO_FAR_MAX_TOKENS = 1500;
const FAILURE_LIMIT = 3;

export interface RecapPlanInput {
  log: LogEntry[];
  oldestLoadedIndex: number;
  historyBudget: number;
  share: number;
  inputBudget: (pendingCount: number) => number;
  maxPending?: number;
}

export interface RecapPlan {
  request: Omit<RecapRequest, "plot">;
  pending: LogEntry[];
  indexRange: [number, number];
}

function isEmptyNarration(entry: LogEntry): boolean {
  return (
    entry.role === LogEntryRole.GM &&
    (entry.text.trim() === "" || entry.text === "...")
  );
}

function estimateRecapTokens(entry: LogEntry): number {
  const lines = readRecap(entry);
  if (lines) return countRecapTokens(lines);
  return Math.max(
    MIN_ESTIMATED_RECAP_TOKENS,
    Math.round(countEntryTokens(entry) * ESTIMATED_RECAP_RATIO),
  );
}

function storySoFar(log: LogEntry[], before: number, budget: number) {
  const lines: string[][] = [];
  let tokens = 0;
  for (let i = before - 1; i >= 0; i--) {
    const entry = log[i];
    if (!isRecapPassage(entry)) continue;
    const recap = readRecap(entry);
    if (!recap?.length) continue;
    const cost = countRecapTokens(recap);
    if (tokens + cost > budget) break;
    lines.unshift(recap);
    tokens += cost;
  }
  return { lines: lines.flat(), tokens };
}

function buildPlan(
  input: RecapPlanInput,
  candidates: number[],
): RecapPlan | null {
  const { log, oldestLoadedIndex } = input;
  const maxPending = Math.max(
    1,
    Math.min(MAX_BATCH, input.maxPending ?? MAX_BATCH),
  );
  const candidateSet = new Set(candidates);
  let first = candidates[0];
  while (first > 0 && log[first - 1].role === LogEntryRole.PLAYER) first -= 1;
  const budget = input.inputBudget(Math.min(candidates.length, maxPending));
  const history = storySoFar(
    log,
    first,
    Math.min(STORY_SO_FAR_MAX_TOKENS, Math.floor(budget * STORY_SO_FAR_SHARE)),
  );
  const available = budget - REQUEST_OVERHEAD_TOKENS - history.tokens;

  const chosen = new Set<number>();
  let used = 0;
  let last = first;
  for (let i = first; i < log.length && chosen.size < maxPending; i++) {
    const entry = log[i];
    const isCandidate = candidateSet.has(i);
    const cost = isCandidate
      ? countEntryTokens(entry)
      : entry.role === LogEntryRole.GM
        ? estimateRecapTokens(entry)
        : countEntryTokens(entry);
    if (used + cost > available) break;
    used += cost;
    if (isCandidate) {
      chosen.add(i);
      last = i;
    }
    if (i >= candidates[candidates.length - 1]) break;
  }
  if (chosen.size === 0) return null;

  const range: RecapRangeEntry[] = log
    .slice(first, last + 1)
    .map((entry, offset) => ({ entry, pending: chosen.has(first + offset) }))
    .filter(({ entry }) => !isEmptyNarration(entry));
  return {
    request: { storySoFar: history.lines, range },
    pending: [...chosen].map((index) => log[index]),
    indexRange: [oldestLoadedIndex + first, oldestLoadedIndex + last],
  };
}

export function planRecapBatch(input: RecapPlanInput): RecapPlan | null {
  const { log, historyBudget, share } = input;
  if (historyBudget <= 0) return null;

  const passages: number[] = [];
  log.forEach((entry, index) => {
    if (isRecapPassage(entry)) passages.push(index);
  });
  if (passages.length <= MIN_VERBATIM_PASSAGES) return null;
  const floor = passages[passages.length - MIN_VERBATIM_PASSAGES];

  let boundary = -1;
  for (let i = passages.length - 1; i >= 0; i--) {
    if (readRecap(log[passages[i]]) !== undefined) {
      boundary = passages[i];
      break;
    }
  }

  const verbatimBudget = historyBudget * (1 - share);
  let verbatimTokens = 0;
  for (let i = boundary + 1; i < log.length; i++) {
    if (!isEmptyNarration(log[i])) verbatimTokens += countEntryTokens(log[i]);
  }

  let cut = boundary + 1;
  if (verbatimTokens > HIGH_WATER * verbatimBudget) {
    let kept = 0;
    cut = log.length;
    while (cut > 0) {
      const entry = log[cut - 1];
      const tokens = isEmptyNarration(entry) ? 0 : countEntryTokens(entry);
      if (kept + tokens > LOW_WATER * verbatimBudget) break;
      kept += tokens;
      cut -= 1;
    }
  }
  cut = Math.min(cut, floor);

  const horizonGoal = HORIZON_FACTOR * share * historyBudget;
  let horizon = Math.max(cut, 0);
  let estimated = 0;
  while (horizon > 0 && estimated < horizonGoal) {
    horizon -= 1;
    if (isRecapPassage(log[horizon])) {
      estimated += estimateRecapTokens(log[horizon]);
    }
  }

  const candidates = passages.filter(
    (index) =>
      index >= horizon && index < cut && readRecap(log[index]) === undefined,
  );
  if (candidates.length === 0) return null;
  const hasGap = candidates.some((index) => index < boundary);
  const overflowing = verbatimTokens > verbatimBudget;
  if (!hasGap && !overflowing && candidates.length < MIN_BATCH) return null;

  return buildPlan(input, candidates);
}

export function planRecapRedo(
  log: LogEntry[],
  oldestLoadedIndex: number,
  entryIds: string[],
  inputBudget: (pendingCount: number) => number,
): RecapPlan | null {
  const ids = new Set(entryIds);
  const candidates: number[] = [];
  log.forEach((entry, index) => {
    if (ids.has(entry.id) && isRecapPassage(entry)) candidates.push(index);
  });
  if (candidates.length === 0) return null;
  return buildPlan(
    { log, oldestLoadedIndex, historyBudget: 1, share: 0, inputBudget },
    candidates,
  );
}

interface RunningJob {
  taleId: string;
  controller: AbortController;
}

let running: RunningJob | null = null;
let rerunTaleId: string | null = null;
const failures = new Map<string, number>();
const batchLimits = new Map<string, number>();
const stopped = new Set<string>();

function canRunFor(taleId: string): boolean {
  if (!storyRecapsEnabled() || stopped.has(taleId)) return false;
  if (useTaleStore.getState().id !== taleId || !isTaleInPlay(taleId)) {
    return false;
  }
  if (usePlayActivityStore.getState().narrating > 0) return false;
  return isModelRoleConfigured(useSettingsStore.getState().modelRoles.utility);
}

function plotFor(): string | undefined {
  const { components } = useTaleStore.getState();
  return getPromptComponentContent(components, PromptComponentType.PLOT);
}

async function runPlan(
  taleId: string,
  plan: RecapPlan,
  signal: AbortSignal,
): Promise<number> {
  const results = await generateRecaps(
    { ...plan.request, plot: plotFor() },
    signal,
  );
  if (signal.aborted) return 0;
  const writes: RecapWrite[] = plan.pending.map((entry) => ({
    entryId: entry.id,
    lines: results.get(entry.id) ?? [],
    sourceText: entry.text,
    expectedRecap: readRecap(entry),
  }));
  const applied = await setLogEntryRecaps(taleId, writes, {
    canWrite: () =>
      !signal.aborted &&
      useTaleStore.getState().id === taleId &&
      isTaleInPlay(taleId),
    indexRange: plan.indexRange,
  });
  if (applied.length === 0) return 0;
  const appliedIds = new Set(applied);
  useTaleStore
    .getState()
    .applyRecaps(writes.filter((write) => appliedIds.has(write.entryId)));
  wakeSyncBackground();
  return applied.length;
}

function stopOnNarration(controller: AbortController): () => void {
  return usePlayActivityStore.subscribe((state) => {
    if (state.narrating > 0) controller.abort();
  });
}

function isQuietError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    isAbortError(error) ||
    (error instanceof Error && error.message === "Tale not found")
  );
}

function recordFailure(taleId: string, error: unknown): void {
  console.warn("Story recaps failed:", error);
  if (error instanceof RecapParseError) {
    const limit = batchLimits.get(taleId) ?? MAX_BATCH;
    batchLimits.set(taleId, Math.max(1, Math.floor(limit / 2)));
  }
  const count = (failures.get(taleId) ?? 0) + 1;
  failures.set(taleId, count);
  if (count >= FAILURE_LIMIT) {
    stopped.add(taleId);
    const reason = error instanceof Error ? error.message : String(error);
    toast.error(`Story recaps stopped for this session: ${reason}`);
  }
}

async function runBackground(taleId: string): Promise<void> {
  const controller = new AbortController();
  running = { taleId, controller };
  const unsubscribe = stopOnNarration(controller);
  try {
    const budget = getRecapBudget(taleId);
    if (!budget || !canRunFor(taleId)) return;
    const { log, oldestLoadedIndex } = useTaleStore.getState();
    const plan = planRecapBatch({
      log,
      oldestLoadedIndex,
      historyBudget: budget.historyBudget,
      share: budget.share,
      inputBudget: recapInputBudget,
      maxPending: batchLimits.get(taleId),
    });
    if (!plan) return;
    await runPlan(taleId, plan, controller.signal);
    failures.delete(taleId);
  } catch (error) {
    if (!isQuietError(error, controller.signal)) recordFailure(taleId, error);
  } finally {
    unsubscribe();
    if (running?.controller === controller) running = null;
    const next = rerunTaleId;
    rerunTaleId = null;
    if (next) scheduleStoryRecaps(next);
  }
}

export function scheduleStoryRecaps(taleId: string): void {
  if (running) {
    rerunTaleId = taleId;
    return;
  }
  if (!canRunFor(taleId)) return;
  void runBackground(taleId);
}

export async function redoRecaps(
  taleId: string,
  entryIds: string[],
): Promise<boolean> {
  running?.controller.abort();
  const controller = new AbortController();
  const unsubscribe = stopOnNarration(controller);
  try {
    const { log, oldestLoadedIndex } = useTaleStore.getState();
    const plan = planRecapRedo(
      log,
      oldestLoadedIndex,
      entryIds,
      recapInputBudget,
    );
    if (!plan) return false;
    return (await runPlan(taleId, plan, controller.signal)) > 0;
  } catch (error) {
    if (isQuietError(error, controller.signal)) return false;
    throw error;
  } finally {
    unsubscribe();
  }
}

export function cancelStoryRecaps(): void {
  running?.controller.abort();
  rerunTaleId = null;
  failures.clear();
  batchLimits.clear();
  stopped.clear();
}
