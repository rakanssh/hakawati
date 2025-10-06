import { useCallback, useEffect, useRef, useState } from "react";
import { getModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";
import { useSettingsStore } from "@/store";

export function useLLMProviders() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const { openAiBaseUrl, setModel } = useSettingsStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);

    try {
      const fetchedModels = await getModels(abortControllerRef.current.signal);

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setModels(fetchedModels);

      if (fetchedModels.length > 0) {
        const currentModel = useSettingsStore.getState().model;
        if (
          !currentModel ||
          !fetchedModels.find((m) => m.id === currentModel.id)
        ) {
          setModel(fetchedModels[0]);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch models:", error);
      setModels([]);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [setModel]);

  const refresh = useCallback(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    fetchModels();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [openAiBaseUrl, fetchModels]);

  return { models, loading, refresh };
}
