import type { Item, LogEntry, PromptComponent, StoryCard } from "@/types";
import type { Stat } from "@/types/stats.type";

export const TALE_SCHEMA_VERSION = 1;
export const TALE_STATE_SCHEMA_VERSION = 1;
export const TALE_PACKAGE_FORMAT_VERSION = 1;

export type TaleCurrentState = {
  components: PromptComponent[];
  storyCards: StoryCard[];
  gm: {
    stats: Stat[];
    inventory: Item[];
    scratchpad: Record<string, unknown>;
  };
};

export type TaleTurn = {
  id: string;
  seq: number;
  entries: LogEntry[];
  createdAt: number;
  updatedAt?: number;
};

export type TaleSessionState = {
  undoStack: LogEntry[];
  editorState: Record<string, unknown>;
};

export function createTaleCurrentState(input: {
  components: PromptComponent[];
  storyCards: StoryCard[];
  stats: Stat[];
  inventory: Item[];
  scratchpad?: Record<string, unknown>;
}): TaleCurrentState {
  return {
    components: input.components,
    storyCards: input.storyCards,
    gm: {
      stats: input.stats,
      inventory: input.inventory,
      scratchpad: input.scratchpad ?? {},
    },
  };
}

export function sanitizeLogEntries(entries: LogEntry[]): LogEntry[] {
  return entries.map((entry) => {
    const { _tokenCount: _omitTokenCount, ...cleanEntry } = entry;
    return cleanEntry;
  });
}

export function sanitizeTurnEntries(entries: LogEntry[]): LogEntry[] {
  const cleanEntries = sanitizeLogEntries(entries);
  if (cleanEntries.length === 0) {
    throw new Error("Tale turns must contain at least one log entry");
  }
  return cleanEntries;
}

export function createTaleSessionState(input?: {
  undoStack?: LogEntry[];
  editorState?: Record<string, unknown>;
}): TaleSessionState {
  return {
    undoStack: sanitizeLogEntries(input?.undoStack ?? []),
    editorState: input?.editorState ?? {},
  };
}

export function flattenTurns(turns: Array<Pick<TaleTurn, "entries">>) {
  return turns.flatMap((turn) => sanitizeLogEntries(turn.entries));
}
