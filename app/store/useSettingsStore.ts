import { LLMModel } from "@/services/llm/schema";
import { ApiType, ResponseMode } from "@/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsStoreType {
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
  fontSize: number;
  customGmPrompt?: string;
  customStorytellerPrompt?: string;
  customContinuePrompt?: string;
  customContinueAuthorNote?: string;
  useCustomGmPrompt: boolean;
  useCustomStorytellerPrompt: boolean;
  useCustomContinuePrompt: boolean;
  useCustomContinueAuthorNote: boolean;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setResponseMode: (responseMode: ResponseMode) => void;
  setModel: (model: LLMModel | undefined) => void;
  setContextWindow: (contextWindow: number) => void;
  setOpenAiBaseUrl: (openAiBaseUrl: string) => void;
  setMaxTokens: (maxTokens: number) => void;
  setTemperature: (temperature: number | null) => void;
  setTopP: (topP: number | null) => void;
  setTopK: (topK: number | null) => void;
  setFrequencyPenalty: (frequencyPenalty: number | null) => void;
  setPresencePenalty: (presencePenalty: number | null) => void;
  setRepetitionPenalty: (repetitionPenalty: number | null) => void;
  setMinP: (minP: number | null) => void;
  setTopA: (topA: number | null) => void;
  setSeed: (seed: number) => void;
  randomSeed: () => void;
  setUiScale: (scale: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  setToDefault: () => void;
  setCustomGmPrompt: (prompt: string) => void;
  setCustomStorytellerPrompt: (prompt: string) => void;
  setCustomContinuePrompt: (prompt: string) => void;
  setCustomContinueAuthorNote: (prompt: string) => void;
  setUseCustomGmPrompt: (use: boolean) => void;
  setUseCustomStorytellerPrompt: (use: boolean) => void;
  setUseCustomContinuePrompt: (use: boolean) => void;
  setUseCustomContinueAuthorNote: (use: boolean) => void;
  resetGmPrompt: () => void;
  resetStorytellerPrompt: () => void;
  resetContinuePrompt: () => void;
  resetContinueAuthorNote: () => void;
  resetAllPromptsToDefault: () => void;
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
      fontSize: 1,
      customGmPrompt: undefined,
      customStorytellerPrompt: undefined,
      customContinuePrompt: undefined,
      customContinueAuthorNote: undefined,
      useCustomGmPrompt: false,
      useCustomStorytellerPrompt: false,
      useCustomContinuePrompt: false,
      useCustomContinueAuthorNote: false,
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
      setTemperature: (temperature: number | null) =>
        set({
          temperature:
            temperature === null
              ? undefined
              : Math.max(0, Math.min(2, temperature)),
        }),
      setTopP: (topP: number | null) =>
        set({
          topP: topP === null ? undefined : Math.max(0, Math.min(1, topP)),
        }),
      setTopK: (topK: number | null) =>
        set({ topK: topK === null ? undefined : Math.max(1, topK) }),
      setFrequencyPenalty: (frequencyPenalty: number | null) =>
        set({
          frequencyPenalty:
            frequencyPenalty === null
              ? undefined
              : Math.max(-2, Math.min(2, frequencyPenalty)),
        }),
      setPresencePenalty: (presencePenalty: number | null) =>
        set({
          presencePenalty:
            presencePenalty === null
              ? undefined
              : Math.max(-2, Math.min(2, presencePenalty)),
        }),
      setRepetitionPenalty: (repetitionPenalty: number | null) =>
        set({
          repetitionPenalty:
            repetitionPenalty === null
              ? undefined
              : Math.max(0, Math.min(10, repetitionPenalty)),
        }),
      setMinP: (minP: number | null) =>
        set({
          minP: minP === null ? undefined : Math.max(0, Math.min(1, minP)),
        }),
      setTopA: (topA: number | null) =>
        set({
          topA: topA === null ? undefined : Math.max(0, Math.min(1, topA)),
        }),
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
      setFontSize: (fontSize: number) =>
        set(() => {
          const isFiniteNumber = Number.isFinite(fontSize);
          const normalized = isFiniteNumber ? fontSize : 1;
          const clamped = Math.min(Math.max(normalized, 0.5), 3);
          return { fontSize: Number(clamped.toFixed(2)) };
        }),
      setCustomGmPrompt: (prompt: string) => set({ customGmPrompt: prompt }),
      setCustomStorytellerPrompt: (prompt: string) =>
        set({ customStorytellerPrompt: prompt }),
      setCustomContinuePrompt: (prompt: string) =>
        set({ customContinuePrompt: prompt }),
      setCustomContinueAuthorNote: (prompt: string) =>
        set({ customContinueAuthorNote: prompt }),
      setUseCustomGmPrompt: (use: boolean) => set({ useCustomGmPrompt: use }),
      setUseCustomStorytellerPrompt: (use: boolean) =>
        set({ useCustomStorytellerPrompt: use }),
      setUseCustomContinuePrompt: (use: boolean) =>
        set({ useCustomContinuePrompt: use }),
      setUseCustomContinueAuthorNote: (use: boolean) =>
        set({ useCustomContinueAuthorNote: use }),
      resetGmPrompt: () =>
        set({ customGmPrompt: undefined, useCustomGmPrompt: false }),
      resetStorytellerPrompt: () =>
        set({
          customStorytellerPrompt: undefined,
          useCustomStorytellerPrompt: false,
        }),
      resetContinuePrompt: () =>
        set({
          customContinuePrompt: undefined,
          useCustomContinuePrompt: false,
        }),
      resetContinueAuthorNote: () =>
        set({
          customContinueAuthorNote: undefined,
          useCustomContinueAuthorNote: false,
        }),
      resetAllPromptsToDefault: () =>
        set({
          customGmPrompt: undefined,
          customStorytellerPrompt: undefined,
          customContinuePrompt: undefined,
          customContinueAuthorNote: undefined,
          useCustomGmPrompt: false,
          useCustomStorytellerPrompt: false,
          useCustomContinuePrompt: false,
          useCustomContinueAuthorNote: false,
        }),
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
          fontSize: 1,
        }),
    }),
    {
      name: "settings",
    },
  ),
);
