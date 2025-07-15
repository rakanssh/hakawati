import { LLMModel } from "@/services/llm/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const enum ApiType {
  OPENROUTER = "openrouter",
}

interface SettingsStoreType {
  apiKey: string;
  apiType: ApiType;
  model: LLMModel | undefined;
  contextWindow: number;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setModel: (model: LLMModel) => void;
  setContextWindow: (contextWindow: number) => void;
}

export const useSettingsStore = create<SettingsStoreType>()(
  persist(
    (set) => ({
      apiKey: "",
      apiType: ApiType.OPENROUTER,
      model: undefined,
      contextWindow: 10000,
      setApiKey: (apiKey: string) => set({ apiKey }),
      setApiType: (apiType: ApiType) => set({ apiType }),
      setModel: (model: LLMModel) => {
        console.debug(
          `Setting model: ${model.name} with context window: ${model.contextLength}`
        );
        set({
          contextWindow: Math.min(
            useSettingsStore.getState().contextWindow ?? 2048,
            model.contextLength
          ),
        });
        console.debug(
          `Setting context window: ${useSettingsStore.getState().contextWindow}`
        );
        set({ model });
      },
      setContextWindow: (contextWindow: number) => set({ contextWindow }),
    }),
    {
      name: "settings",
    }
  )
);
