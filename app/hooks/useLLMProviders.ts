import { useCallback, useEffect, useRef, useState } from "react";
import { getModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";
import { useSettingsStore } from "@/store";
import { toast } from "sonner";

export function useLLMProviders() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { openAiBaseUrl, setModel } = useSettingsStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(async () => {
    if (!openAiBaseUrl || openAiBaseUrl.trim() === "") {
      setModels([]);
      setError(undefined);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(undefined);

    try {
      const fetchedModels = await getModels(abortControllerRef.current.signal);

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setModels(fetchedModels);
      setError(undefined);

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
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch models";
      console.error("Failed to fetch models:", error);
      setError(errorMessage);
      toast.error("Failed to fetch models", {
        description: errorMessage,
      });
      setModels([]);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [setModel, openAiBaseUrl]);

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

  return { models, loading, error, refresh };
}
