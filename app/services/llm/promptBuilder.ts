import { LogEntry } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import { ChatMessage, ChatRequest, LLMModel } from "./schema";
import { GM_SYSTEM_PROMPT } from "@/prompts/system";

interface BuildMessageParams {
  log: LogEntry[];
  stats: Stat[];
  inventory: string[];
  lastMessage: string;
  model: LLMModel;
}

export function buildMessage({
  log,
  stats,
  inventory,
  lastMessage,
  model,
}: BuildMessageParams): ChatRequest {
  const messages: ChatMessage[] = log.map((entry) => ({
    role: entry.role === "player" ? "user" : "assistant",
    content: entry.text,
  }));

  messages.unshift({ role: "system", content: GM_SYSTEM_PROMPT });

  const gameState = `
**Game State:**
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory)}
`;

  const userMessage = `${gameState}\n\n${lastMessage}`;

  messages.push({ role: "user", content: userMessage });
  console.log(messages);

  return {
    model: model.id,
    messages: messages,
    stream: true,
  };
}
