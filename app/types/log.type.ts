import { LLMAction } from "@/services/llm/schema";

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
  isActionError?: boolean;
  actions?: LLMAction[];
  chainId?: string;
  error?: unknown;
  _tokenCount?: number;
};
