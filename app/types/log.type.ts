import { LLMAction } from "@/services/llm/schema";

export type LogEntry = {
  id: string;
  role: "player" | "gm";
  mode?: "say" | "do" | "story";
  text: string;
  actions?: LLMAction[];
};
