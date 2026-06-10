import { resolveModelRole, sendRoleChat } from "@/services/llm";
import { LLMAction } from "@/services/llm/schema";
import { useTaleStore } from "@/store/useTaleStore";
import { useRef, useState } from "react";
import { createDecoder } from "@/services/llm/decoders";
import { buildMessage } from "@/services/llm/promptBuilder";
import { useSettingsStore } from "@/store/useSettingsStore";
import { LogEntryMode } from "@/types";

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (
    lastMessage: {
      text: string;
      mode: LogEntryMode;
    },
    callbacks: {
      onStoryStream: (storyChunk: string) => void;
      onThinkingStream: (thinkingChunk: string) => void;
      onActionsReady: (actions: LLMAction[]) => void;
      onActionParseError: () => void;
      onError: (error: unknown) => void;
    },
  ) => {
    if (abortRef.current && !abortRef.current.signal.aborted) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    const controller = abortRef.current;
    setLoading(true);

    try {
      const { log, stats, inventory, gameMode, components, storyCards } =
        useTaleStore.getState();

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
      const { model, config } = resolveModelRole("narrator");

      const req = await buildMessage({
        log,
        stats,
        inventory,
        lastMessage,
        model,
        components,
        storyCards,
        gameMode,
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
      console.debug(
        `Sending request to ${model.id} with game mode: ${gameMode} and API URL: ${config.baseUrl}`,
      );
      const res = await sendRoleChat("narrator", req, abortRef.current?.signal);

      if (res.iterator) {
        const decoder = createDecoder(gameMode);
        const stream = decoder.decode(res.iterator);
        for await (const chunk of stream) {
          if ("actionParseError" in chunk && chunk.actionParseError) {
            callbacks.onActionParseError();
          } else {
            const { story, thinking, actions } = chunk;
            if (story) {
              callbacks.onStoryStream(story);
            }
            if (thinking) {
              callbacks.onThinkingStream(thinking);
            }
            if (actions) {
              callbacks.onActionsReady(actions);
            }
          }
        }
      } else {
        if (res.content) {
          callbacks.onStoryStream(res.content);
        }
        if (res.thinking) {
          callbacks.onThinkingStream(res.thinking);
        }
        if (res.tool_calls && res.tool_calls.length > 0) {
          const { convertToolCallsToActions } = await import(
            "@/services/llm/tools"
          );
          const actions = convertToolCallsToActions(res.tool_calls);
          if (actions.length > 0) {
            callbacks.onActionsReady(actions);
          }
        }
        console.debug(`Response from ${model.id}:`, res);
      }
    } catch (e) {
      callbacks.onError(e);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return { send, loading, cancel: () => abortRef.current?.abort() };
}
