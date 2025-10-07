import { LLMModel } from "@/services/llm/schema";
import { ApiType, ResponseMode } from "@/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsStoreType {
  apiKey: string;
  apiType: ApiType;
  responseMode: ResponseMode;
  model: LLMModel | undefined;
  contextWindow: number;
  modelContextLength: number;
  openAiBaseUrl: string;
  maxTokens: number; //range [1, contextWindow]
  temperature?: number; //range [0,2]
  topP?: number; //range [0,1]
  topK?: number; //range [1, inf]
  frequencyPenalty?: number; //range [-2,2]
  presencePenalty?: number; //range [-2,2]
  repetitionPenalty?: number; //range [0,10]
  minP?: number; //range [0,1]
  seed: number;
  topA?: number; //range [0,1]
  uiScale: number;
  fontFamily: string;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setResponseMode: (responseMode: ResponseMode) => void;
  setModel: (model: LLMModel | undefined) => void;
  setContextWindow: (contextWindow: number) => void;
  setOpenAiBaseUrl: (openAiBaseUrl: string) => void;
  setMaxTokens: (maxTokens: number) => void;
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
  setUiScale: (scale: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setToDefault: () => void;
}

export const useSettingsStore = create<SettingsStoreType>()(
  persist<SettingsStoreType>(
    (set, get) => ({
      apiKey: "",
      apiType: ApiType.OPENAI,
      responseMode: ResponseMode.FREE_FORM,
      model: undefined,
      contextWindow: 10000,
      modelContextLength: 0,
      maxTokens: 2048,
      openAiBaseUrl: "",
      seed: Math.floor(Math.random() * 1000000),
      uiScale: 1,
      fontFamily: "system-ui",
      setApiKey: (apiKey: string) => set({ apiKey }),
      setApiType: (apiType: ApiType) => set({ apiType }),
      setResponseMode: (responseMode: ResponseMode) => set({ responseMode }),
      setModel: (model: LLMModel | undefined) => {
        if (model) {
          console.debug(
            `Setting model: ${model.name} with context window: ${model.contextLength ?? "unknown"}.`,
          );
          const length = model.contextLength ?? Number.MAX_SAFE_INTEGER;
          set({
            contextWindow: Math.min(get().contextWindow ?? 2048, length),
            modelContextLength: length,
          });
          console.debug(`Setting context window: ${get().contextWindow}`);
        } else {
          console.debug("Clearing model selection");
        }
        set({ model });
      },
      setContextWindow: (contextWindow: number) =>
        set({
          contextWindow:
            get().modelContextLength > 0
              ? Math.min(contextWindow, get().modelContextLength)
              : contextWindow,
        }),
      setOpenAiBaseUrl: (openAiBaseUrl: string) => set({ openAiBaseUrl }),
      setMaxTokens: (maxTokens: number) =>
        set({
          maxTokens:
            get().modelContextLength > 0
              ? Math.max(1, Math.min(get().modelContextLength, maxTokens))
              : maxTokens,
        }),
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
      setUiScale: (scale: number) =>
        set(() => {
          const isFiniteNumber = Number.isFinite(scale);
          const normalized = isFiniteNumber ? scale : 1;
          const clamped = Math.min(Math.max(normalized, 0.8), 1.5);
          return { uiScale: Number(clamped.toFixed(2)) };
        }),
      setFontFamily: (fontFamily: string) => set({ fontFamily }),
      setToDefault: () =>
        set({
          contextWindow: 10000,
          maxTokens: 2048,
          temperature: undefined,
          topP: undefined,
          topK: undefined,
          frequencyPenalty: undefined,
          presencePenalty: undefined,
          repetitionPenalty: undefined,
          minP: undefined,
          topA: undefined,
          responseMode: ResponseMode.FREE_FORM,
          uiScale: 1,
          fontFamily: "system-ui",
        }),
    }),
    {
      name: "settings",
    },
  ),
);
