import { useCallback, useEffect, useRef, useState } from "react";
import { getRoleModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";
import { useSettingsStore } from "@/store";
import { ModelRole } from "@/types";
import { toast } from "sonner";

export function useLLMProviders(role: ModelRole = "narrator") {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const roleConfig = useSettingsStore((state) => state.modelRoles[role]);
  const setRoleModel = useSettingsStore((state) => state.setRoleModel);
  const abortControllerRef = useRef<AbortController | null>(null);
  const baseUrl = roleConfig?.baseUrl ?? "";

  const fetchModels = useCallback(async () => {
    if (!baseUrl || baseUrl.trim() === "") {
      setModels([]);
      setError(undefined);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(undefined);

    try {
      const fetchedModels = await getRoleModels(role, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      setModels(fetchedModels);
      setError(undefined);

      if (fetchedModels.length > 0) {
        const currentModel = useSettingsStore.getState().modelRoles[role].model;
        if (
          !currentModel ||
          !fetchedModels.find((m) => m.id === currentModel.id)
        ) {
          setRoleModel(role, fetchedModels[0]);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch models";

      if (
        (error instanceof Error && error.name === "AbortError") ||
        errorMessage.toLowerCase().includes("cancelled")
      ) {
        return;
      }

      console.error("Failed to fetch models:", error);
      setError(errorMessage);
      toast.error("Failed to fetch models", {
        description: errorMessage,
      });
      setModels([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [baseUrl, role, setRoleModel]);

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
  }, [baseUrl, fetchModels]);

  return { models, loading, error, refresh };
}
