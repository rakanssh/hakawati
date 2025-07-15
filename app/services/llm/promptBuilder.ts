import { LogEntry } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import { ChatMessage, ChatRequest, LLMModel } from "./schema";
import { GM_SYSTEM_PROMPT } from "@/prompts/system";
import { countMessageTokens, countTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";

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
  let contextWindowBudget = useSettingsStore.getState().contextWindow;
  console.debug(`Context window budget: ${contextWindowBudget}`);
  const messages: ChatMessage[] = [];

  // precalc system and user message from context budget
  contextWindowBudget -= countTokens(GM_SYSTEM_PROMPT);
  const gameState = `
**Game State:**
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory)}
`;
  const userMessage = `${gameState}\n\n${lastMessage}`;
  contextWindowBudget -= countTokens(userMessage);

  //Add history
  while (contextWindowBudget > 0 && log.length > 0) {
    const entry = log.pop();
    if (!entry) break;
    const entryTokens = countTokens(entry.text);
    if (entryTokens > contextWindowBudget) {
      break;
    }
    contextWindowBudget -= entryTokens;
    messages.unshift({
      role: entry.role === "player" ? "user" : "assistant",
      content: entry.text,
    });
  }

  //TODO: unshift scenario
  messages.unshift({ role: "system", content: GM_SYSTEM_PROMPT });

  // Add user Message
  messages.push({ role: "user", content: userMessage });

  const tokenCount = countMessageTokens(messages);
  console.debug(
    `Token count for the request: ${tokenCount} (unused budget: ${contextWindowBudget})`
  );

  return {
    model: model.id,
    messages: messages,
    stream: true,
  };
}
