import { LLMAction } from "@/services/llm/schema";

export enum LogEntryMode {
  SAY = "say",
  DO = "do",
  STORY = "story",
  DIRECT = "direct",
}

export type LogEntry = {
  id: string;
  role: "player" | "gm";
  mode?: LogEntryMode;
  text: string;
  isActionError?: boolean;
  actions?: LLMAction[];
};
