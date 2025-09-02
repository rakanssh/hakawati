import { useCallback, useEffect, useState } from "react";
import { getModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";
import { useSettingsStore } from "@/store";

export function useLLMProviders() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const { openAiBaseUrl, setModel } = useSettingsStore();

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedModels = await getModels();
      setModels(fetchedModels);

      // Automatically set the first model if no model is currently selected
      // or if we have new models after an API URL change
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
      console.error("Failed to fetch models:", error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [setModel]);

  const refresh = useCallback(() => {
    fetchModels();
  }, [fetchModels]);

  // Initial fetch and refetch when API URL changes
  useEffect(() => {
    fetchModels();
  }, [openAiBaseUrl, fetchModels]);

  return { models, loading, refresh };
}
