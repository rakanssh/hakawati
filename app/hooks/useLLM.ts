import { sendChat } from "@/services/llm";
import { LLMAction, LLMModel, LLMResponse } from "@/services/llm/schema";
import { useTaleStore } from "@/store/useTaleStore";
import { useRef, useState } from "react";
import { parseStreamWithDecoder } from "@/services/llm/streaming";
import { createDecoder } from "@/services/llm/decoders";
import { buildMessage } from "@/services/llm/promptBuilder";
import { useSettingsStore } from "@/store/useSettingsStore";
import { LogEntryMode } from "@/types";

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const {
    log,
    stats,
    inventory,
    gameMode,
    description,
    authorNote,
    storyCards,
  } = useTaleStore();

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
    lastMessage: {
      text: string;
      mode: LogEntryMode;
    },
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
        description,
        authorNote,
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
        const decoder = createDecoder(gameMode);
        const stream = parseStreamWithDecoder(res.iterator, decoder);
        for await (const chunk of stream) {
          if ("actionParseError" in chunk && chunk.actionParseError) {
            callbacks.onActionParseError();
          } else {
            const { story, actions } = chunk;
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
