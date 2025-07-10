import { sendChat } from "@/services/llm";
import {
  ChatRequest,
  ChatMessage,
  LLMAction,
  LLMModel,
  LLMResponse,
} from "@/services/llm/schema";
import { useGameStore } from "@/store/useGameStore";
import { LogEntry } from "@/types";
import { Stat } from "@/types/stats.type";
import { useRef, useState } from "react";
import { parseJsonStream } from "@/services/llm/streaming";

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const { log, stats, inventory } = useGameStore();
  const abortRef = useRef<AbortController | null>(null);

  const send = async (
    lastMessage: string,
    model: LLMModel,
    callbacks: {
      onStoryStream: (storyChunk: string) => void;
      onActionsReady: (actions: LLMAction[]) => void;
      onError: (error: any) => void;
    }
  ) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    try {
      const req = buildMessage({ log, stats, inventory, lastMessage, model });
      const res = await sendChat(req, abortRef.current?.signal);

      if (res.iterator) {
        const stream = parseJsonStream<LLMResponse>(res.iterator);
        for await (const { story, actions } of stream) {
          if (story) {
            callbacks.onStoryStream(story);
          }
          if (actions) {
            callbacks.onActionsReady(actions);
          }
        }
      } else {
        const response: LLMResponse = JSON.parse(res.content);
        if (response.story) {
          callbacks.onStoryStream(response.story);
        }
        if (response.actions) {
          callbacks.onActionsReady(response.actions);
        }
      }
    } catch (e) {
      callbacks.onError(e);
    } finally {
      setLoading(false);
    }
  };

  return { send, loading, cancel: () => abortRef.current?.abort() };
}

interface BuildMessageParams {
  log: LogEntry[];
  stats: Stat[];
  inventory: string[];
  lastMessage: string;
  model: LLMModel;
}

function buildMessage({
  log,
  stats,
  inventory,
  lastMessage,
  model,
}: BuildMessageParams): ChatRequest {
  const systemPrompt = `You are a creative and engaging storyteller acting as a Game Master (GM) for a text-based RPG.
Your goal is to guide the player through a rich narrative, responding to their actions and describing the world.

**Game State:**
You must keep track of the player's stats and inventory. Here is the current state:
- Stats: ${JSON.stringify(stats)}
- Inventory: ${JSON.stringify(inventory)}

**Your Instructions:**
1.  Read the conversation history and the player's latest action.
2.  Generate a response that includes a story segment and optional actions to modify the game state.
3.  You MUST format your response as a single JSON object. Do not include any text outside of this JSON object.
4.  The JSON object must have a \`story\` key with a string value describing the events.
5.  Optionally, the JSON object can have an \`actions\` key with an array of action objects.
6.  Ensure that player actions properly conform to the game state.
7.  Prefer that modifications to the game state are a result of player action where possible.

**Available Actions:**
You can use the following actions to change the game state. Only use these actions when it makes sense in the story, preferring to react to player actions. 

- \`MODIFY_STAT\`: Change a player's stat.
  - \`payload\`: { "name": "StatName", "value": number } (value can be positive or negative)
- \`ADD_TO_INVENTORY\`: Add an item to the player's inventory.
  - \`payload\`: { "item": "ItemName" }
- \`REMOVE_FROM_INVENTORY\`: Remove an item from the player's inventory.
  - \`payload\`: { "item": "ItemName" }
- \`ADD_TO_STATS\`: Add a stat to the player's stats.
  - \`payload\`: { "name": "StatName", "value": number } (value can be positive or negative)

**Example Response:**
{
  "story": "...Story",
  "actions": [
    { "type": "MODIFY_STAT", "payload": { "name": "HP", "value": -5 } }
  ]
}

Now, continue the story based on the player's input.`;

  const messages: ChatMessage[] = log.map((entry) => ({
    role: entry.role === "player" ? "user" : "assistant",
    content: entry.text,
  }));

  messages.unshift({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: lastMessage });

  return {
    model: model.id,
    messages: messages,
    stream: true,
  };
}
