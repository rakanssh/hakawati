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
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setModel: (model: LLMModel) => void;
}

export const useSettingsStore = create<SettingsStoreType>()(
  persist(
    (set) => ({
      apiKey: "",
      apiType: ApiType.OPENROUTER,
      model: undefined,
      setApiKey: (apiKey: string) => set({ apiKey }),
      setApiType: (apiType: ApiType) => set({ apiType }),
      setModel: (model: LLMModel) => set({ model }),
    }),
    {
      name: "settings",
    }
  )
);
