import { LLMAction } from "@/services/llm/schema";

export enum LogEntryMode {
  SAY = "say",
  DO = "do",
  STORY = "story",
  DIRECT = "direct",
}

export enum LogEntryRole {
  PLAYER = "player",
  GM = "gm",
}

export type LogSegment = {
  id: string;
  text: string;
  actions?: LLMAction[];
  isActionError?: boolean;
};

export type LogEntry = {
  id: string;
  role: LogEntryRole;
  mode?: LogEntryMode;
  text: string;
  isActionError?: boolean;
  actions?: LLMAction[];
  segments?: LogSegment[];
};
