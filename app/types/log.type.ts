import { LLMAction } from "@/services/llm/schema";
import type { Item } from "./item.type";
import type { Stat } from "./stats.type";

export type LogActionState = { stats: Stat[]; inventory: Item[] };

export enum LogEntryMode {
  SAY = "say",
  DO = "do",
  STORY = "story",
  DIRECT = "direct",
  CONTINUE = "continue",
}

export enum LogEntryRole {
  PLAYER = "player",
  GM = "gm",
}

export type LogEntry = {
  id: string;
  role: LogEntryRole;
  mode?: LogEntryMode;
  text: string;
  thinking?: string;
  isActionError?: boolean;
  actions?: LLMAction[];
  actionState?: { before: LogActionState; after: LogActionState };
  chainId?: string;
  /** A passage the player wrote with Story, saved as GM narration. */
  isStoryInput?: boolean;
  /** Why the reply failed, or `true` without a reason. Older saves may hold `{}`. */
  error?: unknown;
  _tokenCount?: number;
};
