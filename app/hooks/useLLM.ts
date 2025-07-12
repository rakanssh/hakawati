import { sendChat } from "@/services/llm";
import { LLMAction, LLMModel, LLMResponse } from "@/services/llm/schema";
import { useGameStore } from "@/store/useGameStore";
import { useRef, useState } from "react";
import { parseJsonStream } from "@/services/llm/streaming";
import { buildMessage } from "@/services/llm/promptBuilder";

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
