import { LogEntry } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import { ChatMessage, ChatRequest, LLMModel } from "./schema";
import { GM_SYSTEM_PROMPT } from "@/prompts/system";
import { countMessageTokens, countTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Scenario, StoryCard } from "@/types/context.type";

function injectStoryCards(text: string, storyCards: StoryCard[]): string {
  let storyCardInjections = "";

  for (const card of storyCards) {
    if (
      card.triggers.some(
        (trigger) =>
          trigger && text.toLowerCase().includes(trigger.toLowerCase())
      )
    ) {
      storyCardInjections += `\n${card.content}`;
    }
  }

  if (storyCardInjections) {
    return `${text}\n[Context: ${storyCardInjections}]`;
  }

  return text;
}
interface BuildMessageParams {
  log: LogEntry[];
  stats: Stat[];
  inventory: string[];
  lastMessage: string;
  scenario: Scenario;
  storyCards: StoryCard[];
  model: LLMModel;
}

export function buildMessage(params: BuildMessageParams): ChatRequest {
  const { log, stats, inventory, lastMessage, scenario, storyCards, model } =
    params;
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
  const userMessageContent = injectStoryCards(lastMessage, storyCards);
  const userMessage = `${gameState}\n\n${userMessageContent}`;
  contextWindowBudget -= countTokens(userMessage);
  contextWindowBudget -= countTokens(scenario.description);
  contextWindowBudget -= countTokens(scenario.authorNote);

  //Add history
  while (contextWindowBudget > 0 && log.length > 0) {
    const entry = log.pop();
    if (!entry) break;

    const entryText = injectStoryCards(entry.text, storyCards);
    const entryTokens = countTokens(entryText);

    if (entryTokens > contextWindowBudget) {
      break;
    }
    contextWindowBudget -= entryTokens;
    messages.unshift({
      role: entry.role === "player" ? "user" : "assistant",
      content: entryText,
    });
  }

  // Add scenario description, author note, and system prompt
  if (scenario.description) {
    messages.unshift({ role: "system", content: scenario.description });
  }
  messages.unshift({ role: "system", content: GM_SYSTEM_PROMPT });

  if (scenario.authorNote) {
    messages.push({ role: "system", content: scenario.authorNote });
  }
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
