import { LLMModel } from "@/services/llm/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const enum ApiType {
  OPENAI = "openai",
}

interface SettingsStoreType {
  apiKey: string;
  apiType: ApiType;
  model: LLMModel | undefined;
  contextWindow: number;
  modelContextLength: number;
  openAiBaseUrl: string;
  temperature?: number; //range [0,2]
  topP?: number; //range [0,1]
  topK?: number; //range [1, inf]
  frequencyPenalty?: number; //range [-2,2]
  presencePenalty?: number; //range [-2,2]
  repetitionPenalty?: number; //range [0,10]
  minP?: number; //range [0,1]
  topA?: number; //range [0,1]
  seed: number;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setModel: (model: LLMModel) => void;
  setContextWindow: (contextWindow: number) => void;
  setOpenAiBaseUrl: (openAiBaseUrl: string) => void;
  setTemperature: (temperature: number) => void;
  setTopP: (topP: number) => void;
  setTopK: (topK: number) => void;
  setFrequencyPenalty: (frequencyPenalty: number) => void;
  setPresencePenalty: (presencePenalty: number) => void;
  setRepetitionPenalty: (repetitionPenalty: number) => void;
  setMinP: (minP: number) => void;
  setTopA: (topA: number) => void;
  setSeed: (seed: number) => void;
  randomSeed: () => void;
}

export const useSettingsStore = create<SettingsStoreType>()(
  persist<SettingsStoreType>(
    (set, get) => ({
      apiKey: "",
      apiType: ApiType.OPENAI,
      model: undefined,
      contextWindow: 10000,
      modelContextLength: 0,
      openAiBaseUrl: "https://openrouter.ai/api/v1",
      seed: Math.floor(Math.random() * 1000000),
      setApiKey: (apiKey: string) => set({ apiKey }),
      setApiType: (apiType: ApiType) => set({ apiType }),
      setModel: (model: LLMModel) => {
        console.debug(
          `Setting model: ${model.name} with context window: ${model.contextLength}.`
        );
        set({
          contextWindow: Math.min(
            get().contextWindow ?? 2048,
            model.contextLength
          ),
          modelContextLength: model.contextLength,
        });
        console.debug(`Setting context window: ${get().contextWindow}`);
        set({ model });
      },
      setContextWindow: (contextWindow: number) =>
        set({
          contextWindow: Math.min(
            contextWindow,
            get().modelContextLength ?? 2048
          ),
        }),
      setOpenAiBaseUrl: (openAiBaseUrl: string) => set({ openAiBaseUrl }),
      setTemperature: (temperature: number) =>
        set({ temperature: Math.max(0, Math.min(2, temperature)) }),
      setTopP: (topP: number) => set({ topP: Math.max(0, Math.min(1, topP)) }),
      setTopK: (topK: number) => set({ topK: Math.max(1, topK) }),
      setFrequencyPenalty: (frequencyPenalty: number) =>
        set({ frequencyPenalty: Math.max(-2, Math.min(2, frequencyPenalty)) }),
      setPresencePenalty: (presencePenalty: number) =>
        set({ presencePenalty: Math.max(-2, Math.min(2, presencePenalty)) }),
      setRepetitionPenalty: (repetitionPenalty: number) =>
        set({
          repetitionPenalty: Math.max(0, Math.min(10, repetitionPenalty)),
        }),
      setMinP: (minP: number) => set({ minP: Math.max(0, Math.min(1, minP)) }),
      setTopA: (topA: number) => set({ topA: Math.max(0, Math.min(1, topA)) }),
      setSeed: (seed: number) => set({ seed }),
      randomSeed: () => set({ seed: Math.floor(Math.random() * 1000000) }),
    }),
    {
      name: "settings",
    }
  )
);
