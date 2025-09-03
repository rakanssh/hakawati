import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { Stat } from "@/types/stats.type";
import {
  ChatMessage,
  ChatRequest,
  ChatRequestOptions,
  LLMModel,
} from "./schema";
import { GM_SYSTEM_PROMPT, STORY_TELLER_SYSTEM_PROMPT } from "@/prompts/system";
import { countMessageTokens } from "./tokenCounter";
import { useSettingsStore } from "@/store/useSettingsStore";
import { GameMode, StoryCard, Item, ResponseMode } from "@/types";
function injectStoryCards(text: string, storyCards: StoryCard[]): string {
  let storyCardInjections = "";

  for (const card of storyCards) {
    if (
      card.triggers.some(
        (trigger) =>
          trigger && text.toLowerCase().includes(trigger.toLowerCase()),
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
  lastMessage: {
    text: string;
    mode: LogEntryMode;
  };
  description: string;
  authorNote: string;
  storyCards: StoryCard[];
  model: LLMModel;
  options?: ChatRequestOptions;
  gameMode: GameMode;
  responseMode: ResponseMode;
}

export function buildMessage(params: BuildMessageParams): ChatRequest {
  const {
    log,
    stats,
    inventory,
    lastMessage,
    storyCards,
    model,
    description,
    authorNote,
    gameMode,
    responseMode,
  } = params;

  const configuredBudget = useSettingsStore.getState().contextWindow;
  const maxTokens = Math.min(
    model.contextLength ?? configuredBudget,
    configuredBudget,
  );
  const messages: ChatMessage[] = [];

  // Build user message
  const gameState = `
**Game State:**
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory.map((item) => item.name))}
`;
  const userMessageContent = injectMode(
    injectStoryCards(lastMessage.text, storyCards),
    lastMessage.mode,
  );
  //TODO: Refactor these to a factory function if needed
  const userMessage =
    gameMode === GameMode.GM
      ? `${gameState}\n\n${userMessageContent}`
      : userMessageContent;
  const systemPrompt =
    gameMode === GameMode.GM ? GM_SYSTEM_PROMPT : STORY_TELLER_SYSTEM_PROMPT;

  const userMsg: ChatMessage = { role: "user", content: userMessage };
  const userTokens = countMessageTokens([userMsg]);

  const tokenCountFor = (msgs: ChatMessage[]) => countMessageTokens(msgs);
  const canAddWithUser = (candidate: ChatMessage, current: ChatMessage[]) =>
    tokenCountFor([...current, candidate]) + userTokens <= maxTokens;

  if (canAddWithUser({ role: "system", content: systemPrompt }, messages)) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (
    description &&
    canAddWithUser({ role: "system", content: description }, messages)
  ) {
    messages.push({ role: "system", content: description });
  }
  if (
    authorNote &&
    canAddWithUser({ role: "system", content: authorNote }, messages)
  ) {
    messages.push({ role: "system", content: authorNote });
  }

  const history: ChatMessage[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    const entryText = injectStoryCards(entry.text, storyCards);
    const msg: ChatMessage = {
      role: entry.role === LogEntryRole.PLAYER ? "user" : "assistant",
      content: injectMode(entryText, entry.mode),
    };
    // Skip streaming placeholder
    if (
      msg.role === "assistant" &&
      (msg.content === "..." || msg.content.trim() === "")
    ) {
      continue;
    }
    if (canAddWithUser(msg, [...messages, ...history])) {
      history.unshift(msg);
    } else {
      break;
    }
  }

  messages.push(...history);

  // ensure the latest user instruction is included when it isn't already
  const lastLog = log.at(-1);
  const lastIsUser =
    lastLog?.role === LogEntryRole.PLAYER && lastLog.text === lastMessage.text;
  if (!lastIsUser && canAddWithUser(userMsg, messages)) {
    messages.push(userMsg);
  }

  return {
    model: model.id,
    messages,
    stream: true,
    max_tokens: useSettingsStore.getState().maxTokens,
    options: params.options,
    //override response mode for story mode.
    responseMode:
      gameMode === GameMode.GM ? responseMode : ResponseMode.FREE_FORM,
  };
}

function injectMode(text: string, mode?: LogEntryMode): string {
  if (mode === LogEntryMode.DIRECT) return `[Director's Note: ${text}]`;
  if (mode === LogEntryMode.STORY) return `${text}`;
  if (mode === LogEntryMode.DO) return `Action: ${text}`;
  if (mode === LogEntryMode.SAY) return `You Say:"${text}"`;
  return text;
}
