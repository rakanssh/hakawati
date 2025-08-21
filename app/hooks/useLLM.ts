import { sendChat } from "@/services/llm";
import { LLMAction, LLMModel, LLMResponse } from "@/services/llm/schema";
import { useGameStore } from "@/store/useGameStore";
import { useRef, useState } from "react";
import { parseJsonStream } from "@/services/llm/streaming";
import { buildMessage } from "@/services/llm/promptBuilder";
import { useScenarioStore } from "@/store/useScenarioStore";
import { useSettingsStore } from "@/store/useSettingsStore";

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const { log, stats, inventory } = useGameStore();
  const { scenario, storyCards } = useScenarioStore();
  const {
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    repetitionPenalty,
    minP,
    topA,
    seed,
  } = useSettingsStore.getState();
  const abortRef = useRef<AbortController | null>(null);

  const send = async (
    lastMessage: string,
    model: LLMModel,
    callbacks: {
      onStoryStream: (storyChunk: string) => void;
      onActionsReady: (actions: LLMAction[]) => void;
      onActionParseError: () => void;
      onError: (error: unknown) => void;
    },
  ) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    try {
      const req = buildMessage({
        log,
        stats,
        inventory,
        lastMessage,
        model,
        scenario,
        storyCards,
        options: {
          temperature,
          topP,
          topK,
          frequencyPenalty,
          presencePenalty,
          repetitionPenalty,
          minP,
          topA,
          seed,
        },
      });
      console.debug(`Sending request to ${model.id}:`, req);
      const res = await sendChat(req, abortRef.current?.signal);

      if (res.iterator) {
        const stream = parseJsonStream<LLMResponse>(res.iterator);
        for await (const chunk of stream) {
          if ("actionParseError" in chunk && chunk.actionParseError) {
            callbacks.onActionParseError();
          } else {
            const { story, actions } = chunk as Partial<LLMResponse>;
            if (story) {
              callbacks.onStoryStream(story);
            }
            if (actions) {
              callbacks.onActionsReady(actions);
            }
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
