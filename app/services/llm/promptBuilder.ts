import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import {
  ChatMessage,
  ChatRequest,
  ChatRequestOptions,
  LLMModel,
} from "./schema";
import { GM_SYSTEM_PROMPT } from "@/prompts/system";
import { countMessageTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Scenario, StoryCard } from "@/types/context.type";
import { Item } from "@/types";

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
  inventory: Item[];
  lastMessage: string;
  scenario: Scenario;
  storyCards: StoryCard[];
  model: LLMModel;
  options?: ChatRequestOptions;
}

export function buildMessage(params: BuildMessageParams): ChatRequest {
  const { log, stats, inventory, lastMessage, scenario, storyCards, model } =
    params;

  const configuredBudget = useSettingsStore.getState().contextWindow;
  const maxTokens = Math.min(model.contextLength, configuredBudget);
  const messages: ChatMessage[] = [];

  // Build user message
  const gameState = `
**Game State:**
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory.map((item) => item.name))}
`;
  const userMessageContent = injectStoryCards(lastMessage, storyCards);
  const userMessage = `${gameState}\n\n${userMessageContent}`;
  const userMsg: ChatMessage = { role: "user", content: userMessage };
  const userTokens = countMessageTokens([userMsg]);

  const tokenCountFor = (msgs: ChatMessage[]) => countMessageTokens(msgs);
  const canAddWithUser = (candidate: ChatMessage, current: ChatMessage[]) =>
    tokenCountFor([...current, candidate]) + userTokens <= maxTokens;

  if (canAddWithUser({ role: "system", content: GM_SYSTEM_PROMPT }, messages)) {
    messages.push({ role: "system", content: GM_SYSTEM_PROMPT });
  }
  if (
    scenario.description &&
    canAddWithUser({ role: "system", content: scenario.description }, messages)
  ) {
    messages.push({ role: "system", content: scenario.description });
  }
  if (
    scenario.authorNote &&
    canAddWithUser({ role: "system", content: scenario.authorNote }, messages)
  ) {
    messages.push({ role: "system", content: scenario.authorNote });
  }

  const history: ChatMessage[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    const entryText = injectStoryCards(entry.text, storyCards);
    const msg: ChatMessage = {
      role: entry.role === LogEntryRole.PLAYER ? "user" : "assistant",
      content: injectMode(entryText, entry.mode),
    };
    if (canAddWithUser(msg, [...messages, ...history])) {
      // unshift to keep chronological order
      history.unshift(msg);
    } else {
      break;
    }
  }

  messages.push(...history);

  messages.push(userMsg);

  return {
    model: model.id,
    messages,
    stream: true,
    max_tokens: useSettingsStore.getState().maxTokens,
    options: params.options,
  };
}

function injectMode(text: string, mode?: LogEntryMode): string {
  if (mode === LogEntryMode.DIRECT) return `[Director's Note: ${text}]`;
  if (mode === LogEntryMode.STORY) return `${text}`;
  if (mode === LogEntryMode.DO) return `Action: ${text}`;
  if (mode === LogEntryMode.SAY) return `You Say:"${text}"`;
  return text;
}
