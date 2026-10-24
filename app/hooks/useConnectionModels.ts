import { useCallback, useEffect, useRef, useState } from "react";
import { getConnectionModels } from "@/services/llm";
import { ApiConnection, ApiPreset, type LLMModel } from "@/types";
import { useChatGpt } from "./useChatGpt";

/** Checks a connection by listing its models. */
export function useConnectionModels(connection: ApiConnection | undefined) {
  const [models, setModels] = useState<LLMModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const controllerRef = useRef<AbortController | null>(null);
  const isChatGpt = connection?.preset === ApiPreset.CHATGPT;
  const { session, busy } = useChatGpt(isChatGpt);
  const enabled = connection
    ? isChatGpt
      ? Boolean(session?.connected && session.planUsageEnabled && !busy)
      : Boolean(connection.baseUrl.trim())
    : false;
  const { id, preset, baseUrl, apiKey } = connection ?? {};

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    setModels(null);
    setError(undefined);
    if (!enabled || !id || !preset) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const list = await getConnectionModels(
        { id, preset, baseUrl: baseUrl ?? "", apiKey: apiKey ?? "" },
        controller.signal,
      );
      if (!controller.signal.aborted) setModels(list);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [enabled, id, preset, baseUrl, apiKey]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { models, loading, error, enabled, refresh: load };
}
