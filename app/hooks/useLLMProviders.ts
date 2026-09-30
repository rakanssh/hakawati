import { useCallback, useEffect, useRef, useState } from "react";
import { getRoleModels } from "@/services/llm";
import { LLMModel } from "@/services/llm/schema";
import { useSettingsStore } from "@/store";
import { ApiPreset, ModelRole } from "@/types";
import { toast } from "sonner";
import { useChatGpt } from "./useChatGpt";
import { useChatGptStore } from "@/store/useChatGptStore";

export function useLLMProviders(role: ModelRole = "narrator") {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const roleConfig = useSettingsStore((state) => state.modelRoles[role]);
  const setRoleModel = useSettingsStore((state) => state.setRoleModel);
  const abortControllerRef = useRef<AbortController | null>(null);
  const baseUrl = roleConfig?.baseUrl ?? "";
  const apiKey = roleConfig?.apiKey;
  const activePreset = roleConfig?.activePreset;
  const isChatGpt = activePreset === ApiPreset.CHATGPT;
  const { session, busy } = useChatGpt(isChatGpt);
  const accountId = isChatGpt ? session?.account?.id : null;
  const enabled = isChatGpt
    ? Boolean(session?.connected && session.planUsageEnabled && !busy)
    : Boolean(baseUrl.trim());

  const fetchModels = useCallback(async () => {
    abortControllerRef.current?.abort();
    if (!enabled) {
      setModels([]);
      setError(undefined);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(undefined);

    try {
      const fetchedModels = await getRoleModels(role, controller.signal);

      const currentConfig = useSettingsStore.getState().modelRoles[role];
      const currentChatGpt = useChatGptStore.getState();
      if (
        controller.signal.aborted ||
        currentConfig.activePreset !== activePreset ||
        currentConfig.baseUrl !== baseUrl ||
        currentConfig.apiKey !== apiKey ||
        (isChatGpt &&
          (!currentChatGpt.session?.connected ||
            !currentChatGpt.session.planUsageEnabled ||
            currentChatGpt.busy ||
            currentChatGpt.session.account?.id !== accountId))
      ) {
        return;
      }

      setModels(fetchedModels);
      setError(undefined);

      if (fetchedModels.length > 0) {
        const currentModel = useSettingsStore.getState().modelRoles[role].model;
        const refreshedCurrentModel = fetchedModels.find(
          (m) => m.id === currentModel?.id,
        );
        if (!currentModel || !refreshedCurrentModel) {
          setRoleModel(role, fetchedModels[0]);
        } else {
          setRoleModel(role, refreshedCurrentModel);
        }
      } else if (isChatGpt) {
        setRoleModel(role, undefined);
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

      setError(errorMessage);
      if (!isChatGpt) {
        toast.error("Failed to fetch models", { description: errorMessage });
      }
      setModels([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [
    baseUrl,
    apiKey,
    activePreset,
    enabled,
    accountId,
    isChatGpt,
    role,
    setRoleModel,
  ]);

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

  return { models, loading, error, refresh, enabled };
}
