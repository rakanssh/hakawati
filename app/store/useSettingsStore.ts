import { createDefaultProfiles } from "@/data/api-presets";
import { LLMModel } from "@/services/llm/schema";
import { ApiPreset, ApiProfileSettings, ApiType } from "@/types";
import type { Locale } from "@/i18n";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TextDirection = "system" | "ltr" | "rtl";
export type ThinkingVisibility = "all" | "latest" | "none";

// Languages that require a RTL UI. Expand later.
const RTL_LANGUAGES = new Set([
  "ar", // Arabic
]);

/**
 * Resolve the effective text direction based on preference and app language.
 * Returns "ltr" or "rtl". priority is given to user preference then language dir.
 */
export function resolveTextDirection(
  preference: TextDirection,
  appLanguage: string,
): "ltr" | "rtl" {
  if (preference === "ltr" || preference === "rtl") {
    return preference;
  }
  const primaryLang = appLanguage.split("-")[0].toLowerCase();
  return RTL_LANGUAGES.has(primaryLang) ? "rtl" : "ltr";
}

export interface SettingsStoreType {
  // Profile-based settings
  activePreset: ApiPreset;
  profiles: Record<ApiPreset, ApiProfileSettings>;

  // Derived from active profile (for backward compatibility)
  apiKey: string;
  apiType: ApiType;
  model: LLMModel | undefined;
  openAiBaseUrl: string;

  // Global settings
  contextWindow: number;
  modelContextLength: number;
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
  textDirection: TextDirection;
  language: Locale;
  customGmPrompt?: string;
  customStorytellerPrompt?: string;
  customContinuePrompt?: string;
  customContinueAuthorNote?: string;
  customStoryCardGeneratorPrompt?: string;
  useCustomGmPrompt: boolean;
  useCustomStorytellerPrompt: boolean;
  useCustomContinuePrompt: boolean;
  useCustomContinueAuthorNote: boolean;
  useCustomStoryCardGeneratorPrompt: boolean;
  debugConsoleEnabled: boolean;
  thinkingVisibility: ThinkingVisibility;

  setActivePreset: (preset: ApiPreset) => void;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
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
  setTextDirection: (direction: TextDirection) => void;
  setLanguage: (language: Locale) => void;
  setToDefault: () => void;
  setCustomGmPrompt: (prompt: string) => void;
  setCustomStorytellerPrompt: (prompt: string) => void;
  setCustomContinuePrompt: (prompt: string) => void;
  setCustomContinueAuthorNote: (prompt: string) => void;
  setCustomStoryCardGeneratorPrompt: (prompt: string) => void;
  setUseCustomGmPrompt: (use: boolean) => void;
  setUseCustomStorytellerPrompt: (use: boolean) => void;
  setUseCustomContinuePrompt: (use: boolean) => void;
  setUseCustomContinueAuthorNote: (use: boolean) => void;
  setUseCustomStoryCardGeneratorPrompt: (use: boolean) => void;
  setDebugConsoleEnabled: (enabled: boolean) => void;
  setThinkingVisibility: (visibility: ThinkingVisibility) => void;
  resetGmPrompt: () => void;
  resetStorytellerPrompt: () => void;
  resetContinuePrompt: () => void;
  resetContinueAuthorNote: () => void;
  resetStoryCardGeneratorPrompt: () => void;
  resetAllPromptsToDefault: () => void;
}

const defaultProfiles = createDefaultProfiles();

export const useSettingsStore = create<SettingsStoreType>()(
  persist<SettingsStoreType>(
    (set, get) => ({
      // Profile-based settings
      activePreset: ApiPreset.GENERIC,
      profiles: defaultProfiles,

      // Derived from active profile
      apiKey: "",
      apiType: ApiType.OPENAI,
      model: undefined,
      openAiBaseUrl: "",

      // Global settings
      contextWindow: 10000,
      modelContextLength: 0,
      maxTokens: 2048,
      seed: Math.floor(Math.random() * 1000000),
      uiScale: 1,
      fontFamily: "system-ui",
      fontSize: 1,
      textDirection: "system",
      language: "en",
      customGmPrompt: undefined,
      customStorytellerPrompt: undefined,
      customContinuePrompt: undefined,
      customContinueAuthorNote: undefined,
      customStoryCardGeneratorPrompt: undefined,
      useCustomGmPrompt: false,
      useCustomStorytellerPrompt: false,
      useCustomContinuePrompt: false,
      useCustomContinueAuthorNote: false,
      useCustomStoryCardGeneratorPrompt: false,
      debugConsoleEnabled: false,
      thinkingVisibility: "all",

      setActivePreset: (preset: ApiPreset) => {
        const profiles = get().profiles;
        // Fallback to defaults if preset is missing (e.g., newly added preset)
        const defaults = createDefaultProfiles();
        const profile = profiles[preset] ?? defaults[preset];
        set({
          activePreset: preset,
          apiKey: profile.apiKey,
          openAiBaseUrl: profile.baseUrl,
          model: profile.model,
          modelContextLength: profile.model?.contextLength ?? 0,
          // Ensure the profile exists in storage
          profiles: profiles[preset]
            ? profiles
            : { ...profiles, [preset]: profile },
        });
      },

      setApiKey: (apiKey: string) => {
        const activePreset = get().activePreset;
        const profiles = get().profiles;
        set({
          apiKey,
          profiles: {
            ...profiles,
            [activePreset]: {
              ...profiles[activePreset],
              apiKey,
            },
          },
        });
      },

      setApiType: (apiType: ApiType) => set({ apiType }),

      setModel: (model: LLMModel | undefined) => {
        const activePreset = get().activePreset;
        const profiles = get().profiles;

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

        set({
          model,
          profiles: {
            ...profiles,
            [activePreset]: {
              ...profiles[activePreset],
              model,
            },
          },
        });
      },

      setContextWindow: (contextWindow: number) =>
        set({
          contextWindow:
            get().modelContextLength > 0
              ? Math.min(contextWindow, get().modelContextLength)
              : contextWindow,
        }),

      setOpenAiBaseUrl: (openAiBaseUrl: string) => {
        const activePreset = get().activePreset;
        const profiles = get().profiles;
        set({
          openAiBaseUrl,
          profiles: {
            ...profiles,
            [activePreset]: {
              ...profiles[activePreset],
              baseUrl: openAiBaseUrl,
            },
          },
        });
      },

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
      setTextDirection: (direction: TextDirection) =>
        set({ textDirection: direction }),
      setLanguage: (language: Locale) => set({ language }),
      setCustomGmPrompt: (prompt: string) => set({ customGmPrompt: prompt }),
      setCustomStorytellerPrompt: (prompt: string) =>
        set({ customStorytellerPrompt: prompt }),
      setCustomContinuePrompt: (prompt: string) =>
        set({ customContinuePrompt: prompt }),
      setCustomContinueAuthorNote: (prompt: string) =>
        set({ customContinueAuthorNote: prompt }),
      setCustomStoryCardGeneratorPrompt: (prompt: string) =>
        set({ customStoryCardGeneratorPrompt: prompt }),
      setUseCustomGmPrompt: (use: boolean) => set({ useCustomGmPrompt: use }),
      setUseCustomStorytellerPrompt: (use: boolean) =>
        set({ useCustomStorytellerPrompt: use }),
      setUseCustomContinuePrompt: (use: boolean) =>
        set({ useCustomContinuePrompt: use }),
      setUseCustomContinueAuthorNote: (use: boolean) =>
        set({ useCustomContinueAuthorNote: use }),
      setUseCustomStoryCardGeneratorPrompt: (use: boolean) =>
        set({ useCustomStoryCardGeneratorPrompt: use }),
      setDebugConsoleEnabled: (enabled: boolean) =>
        set({ debugConsoleEnabled: enabled }),
      setThinkingVisibility: (visibility: ThinkingVisibility) =>
        set({ thinkingVisibility: visibility }),
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
      resetStoryCardGeneratorPrompt: () =>
        set({
          customStoryCardGeneratorPrompt: undefined,
          useCustomStoryCardGeneratorPrompt: false,
        }),
      resetAllPromptsToDefault: () =>
        set({
          customGmPrompt: undefined,
          customStorytellerPrompt: undefined,
          customContinuePrompt: undefined,
          customContinueAuthorNote: undefined,
          customStoryCardGeneratorPrompt: undefined,
          useCustomGmPrompt: false,
          useCustomStorytellerPrompt: false,
          useCustomContinuePrompt: false,
          useCustomContinueAuthorNote: false,
          useCustomStoryCardGeneratorPrompt: false,
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
          uiScale: 1,
          fontFamily: "system-ui",
          fontSize: 1,
          textDirection: "system",
          language: "en",
          debugConsoleEnabled: false,
          thinkingVisibility: "all",
        }),
    }),
    {
      name: "settings",
      // Migration: merge defaults with persisted profiles to handle new presets
      migrate: (persistedState, _version) => {
        const state = persistedState as SettingsStoreType & {
          profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>;
          showThinkingInLog?: boolean;
          thinkingVisibility?: ThinkingVisibility;
        };

        // Always start with fresh defaults, then merge persisted data
        const defaults = createDefaultProfiles();
        const persistedProfiles = state.profiles ?? {};

        // Handle legacy flat settings (pre-profiles era)
        if (
          !state.profiles &&
          (state.apiKey || state.openAiBaseUrl || state.model)
        ) {
          defaults[ApiPreset.GENERIC] = {
            baseUrl: state.openAiBaseUrl || "",
            apiKey: state.apiKey || "",
            model: state.model,
          };
        }

        // Merge: defaults first, then persisted values take precedence
        const mergedProfiles = { ...defaults };
        for (const key of Object.keys(persistedProfiles) as ApiPreset[]) {
          if (persistedProfiles[key]) {
            mergedProfiles[key] = {
              ...defaults[key],
              ...persistedProfiles[key],
            };
          }
        }

        const thinkingVisibility: ThinkingVisibility =
          state.thinkingVisibility ??
          (state.showThinkingInLog === false ? "none" : "all");

        return {
          ...state,
          activePreset: state.activePreset ?? ApiPreset.GENERIC,
          profiles: mergedProfiles,
          textDirection: state.textDirection ?? "system",
          language: state.language ?? "en",
          debugConsoleEnabled: state.debugConsoleEnabled ?? false,
          thinkingVisibility,
        };
      },
      version: 2,
    },
  ),
);
