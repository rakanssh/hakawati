import { resolveModelRole, sendRoleChat } from "@/services/llm";
import { LLMAction } from "@/services/llm/schema";
import { useTaleStore } from "@/store/useTaleStore";
import { useRef, useState } from "react";
import { createDecoder } from "@/services/llm/decoders";
import { buildMessage } from "@/services/llm/promptBuilder";
import { useSettingsStore } from "@/store/useSettingsStore";
import { LogEntryMode } from "@/types";

export type LlmSendResult =
  | { status: "completed" }
  | { status: "aborted"; error: unknown }
  | { status: "error"; error: unknown };

function abortedResult(signal: AbortSignal): LlmSendResult {
  return { status: "aborted", error: signal.reason ?? new Error("Aborted") };
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    const text = `${error.name} ${error.message}`.toLowerCase();
    return (
      error.name === "AbortError" ||
      text.includes("abort") ||
      text.includes("cancel")
    );
  }
  if (typeof error === "string") {
    const text = error.toLowerCase();
    return text.includes("abort") || text.includes("cancel");
  }
  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const text = `${String(obj.name ?? "")} ${String(
      obj.message ?? "",
    )} ${String(obj.code ?? "")}`.toLowerCase();
    return (
      obj.name === "AbortError" ||
      text.includes("abort") ||
      text.includes("cancel")
    );
  }
  return false;
}

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
  ): Promise<LlmSendResult> => {
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
      const res = await sendRoleChat("narrator", req, controller.signal);
      if (controller.signal.aborted) {
        return abortedResult(controller.signal);
      }

      if (res.iterator) {
        const decoder = createDecoder(gameMode);
        const stream = decoder.decode(res.iterator);
        for await (const chunk of stream) {
          if (controller.signal.aborted) {
            return abortedResult(controller.signal);
          }
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
        if (controller.signal.aborted) {
          return abortedResult(controller.signal);
        }
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
      if (controller.signal.aborted) {
        return abortedResult(controller.signal);
      }
      return { status: "completed" };
    } catch (e) {
      if (isAbortError(e)) {
        return { status: "aborted", error: e };
      }
      callbacks.onError(e);
      return { status: "error", error: e };
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return { send, loading, cancel: () => abortRef.current?.abort() };
}
