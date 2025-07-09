import { useEffect, useState } from "react";
import { getModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";

export function useLLMProviders() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    getModels()
      .then(setModels)
      .finally(() => setLoading(false));
  }, []);
  return { models, loading };
}
