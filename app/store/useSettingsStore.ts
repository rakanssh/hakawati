import { createDefaultProfiles } from "@/data/api-presets";
import { LLMModel } from "@/services/llm/schema";
import {
  ApiPreset,
  ApiProfileSettings,
  ApiType,
  MODEL_ROLES,
  ModelRole,
  ModelRoleSettings,
} from "@/types";
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

function cloneProfiles(
  profiles: Record<ApiPreset, ApiProfileSettings>,
): Record<ApiPreset, ApiProfileSettings> {
  return Object.fromEntries(
    Object.entries(profiles).map(([preset, profile]) => [
      preset,
      { ...profile },
    ]),
  ) as Record<ApiPreset, ApiProfileSettings>;
}

function mergeProfiles(
  profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>,
): Record<ApiPreset, ApiProfileSettings> {
  const defaults = createDefaultProfiles();
  const merged = { ...defaults };

  for (const key of Object.keys(profiles ?? {}) as ApiPreset[]) {
    const profile = profiles?.[key];
    if (profile) {
      merged[key] = {
        ...defaults[key],
        ...profile,
      };
    }
  }

  return merged;
}

export function createDefaultModelRoleSettings(
  activePreset: ApiPreset = ApiPreset.GENERIC,
): ModelRoleSettings {
  const profiles = createDefaultProfiles();
  const profile = profiles[activePreset];
  return {
    apiType: ApiType.OPENAI,
    activePreset,
    profiles,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
  };
}

export function createDefaultModelRoles(): Record<
  ModelRole,
  ModelRoleSettings
> {
  return Object.fromEntries(
    MODEL_ROLES.map((role) => [role, createDefaultModelRoleSettings()]),
  ) as Record<ModelRole, ModelRoleSettings>;
}

function syncActiveProfile(config: ModelRoleSettings): ModelRoleSettings {
  return {
    ...config,
    profiles: {
      ...config.profiles,
      [config.activePreset]: {
        ...config.profiles[config.activePreset],
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
      },
    },
  };
}

function narratorAliases(config: ModelRoleSettings) {
  return {
    activePreset: config.activePreset,
    profiles: config.profiles,
    apiKey: config.apiKey,
    apiType: config.apiType,
    model: config.model,
    openAiBaseUrl: config.baseUrl,
    modelContextLength: config.model?.contextLength ?? 0,
  };
}

type PersistedSettingsState = Partial<SettingsStoreType> & {
  profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>;
  modelRoles?: Partial<Record<ModelRole, Partial<ModelRoleSettings>>>;
  showThinkingInLog?: boolean;
  thinkingVisibility?: ThinkingVisibility;
};

function normalizeRoleSettings(
  input?: Partial<ModelRoleSettings>,
  fallback?: ModelRoleSettings,
): ModelRoleSettings {
  const activePreset =
    input?.activePreset ?? fallback?.activePreset ?? ApiPreset.GENERIC;
  const profiles = mergeProfiles(input?.profiles ?? fallback?.profiles);
  const activeProfile =
    profiles[activePreset] ?? createDefaultProfiles()[activePreset];
  const config: ModelRoleSettings = {
    apiType: input?.apiType ?? fallback?.apiType ?? ApiType.OPENAI,
    activePreset,
    profiles,
    baseUrl: input?.baseUrl ?? fallback?.baseUrl ?? activeProfile.baseUrl,
    apiKey: input?.apiKey ?? fallback?.apiKey ?? activeProfile.apiKey,
    model: input?.model ?? fallback?.model ?? activeProfile.model,
  };

  return syncActiveProfile(config);
}

function createLegacyRoleSettings(
  state: PersistedSettingsState,
): ModelRoleSettings {
  const activePreset = state.activePreset ?? ApiPreset.GENERIC;
  const profiles = mergeProfiles(state.profiles);

  if (!state.profiles && (state.apiKey || state.openAiBaseUrl || state.model)) {
    profiles[ApiPreset.GENERIC] = {
      ...profiles[ApiPreset.GENERIC],
      baseUrl: state.openAiBaseUrl || "",
      apiKey: state.apiKey || "",
      model: state.model,
    };
  }

  const activeProfile = profiles[activePreset] ?? profiles[ApiPreset.GENERIC];
  return syncActiveProfile({
    apiType: state.apiType ?? ApiType.OPENAI,
    activePreset,
    profiles,
    baseUrl: state.openAiBaseUrl ?? activeProfile.baseUrl,
    apiKey: state.apiKey ?? activeProfile.apiKey,
    model: state.model ?? activeProfile.model,
  });
}

export function migrateSettingsState(
  persistedState: unknown,
): SettingsStoreType {
  const state = (persistedState ?? {}) as PersistedSettingsState;
  const defaultRoles = createDefaultModelRoles();
  const legacyRole = createLegacyRoleSettings(state);

  const modelRoles = state.modelRoles
    ? (Object.fromEntries(
        MODEL_ROLES.map((role) => [
          role,
          normalizeRoleSettings(
            state.modelRoles?.[role],
            role === "narrator" ? legacyRole : defaultRoles[role],
          ),
        ]),
      ) as Record<ModelRole, ModelRoleSettings>)
    : ({
        narrator: normalizeRoleSettings(legacyRole),
        utility: normalizeRoleSettings({
          ...legacyRole,
          profiles: cloneProfiles(legacyRole.profiles),
        }),
        speechToText: defaultRoles.speechToText,
        textToSpeech: defaultRoles.textToSpeech,
      } satisfies Record<ModelRole, ModelRoleSettings>);

  const narrator = modelRoles.narrator;
  const thinkingVisibility: ThinkingVisibility =
    state.thinkingVisibility ??
    (state.showThinkingInLog === false ? "none" : "all");

  return {
    ...state,
    ...narratorAliases(narrator),
    modelRoles,
    textDirection: state.textDirection ?? "system",
    language: state.language ?? "en",
    thinkingVisibility,
  } as SettingsStoreType;
}

export function isModelRoleConfigured(config: ModelRoleSettings): boolean {
  return Boolean(config.baseUrl.trim() && config.model);
}

export interface SettingsStoreType {
  // Narrator aliases retained for backward compatibility.
  activePreset: ApiPreset;
  profiles: Record<ApiPreset, ApiProfileSettings>;
  apiKey: string;
  apiType: ApiType;
  model: LLMModel | undefined;
  openAiBaseUrl: string;

  modelRoles: Record<ModelRole, ModelRoleSettings>;

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
  thinkingVisibility: ThinkingVisibility;

  setActivePreset: (preset: ApiPreset) => void;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
  setModel: (model: LLMModel | undefined) => void;
  setContextWindow: (contextWindow: number) => void;
  setOpenAiBaseUrl: (openAiBaseUrl: string) => void;
  setRoleActivePreset: (role: ModelRole, preset: ApiPreset) => void;
  setRoleApiKey: (role: ModelRole, apiKey: string) => void;
  setRoleApiType: (role: ModelRole, apiType: ApiType) => void;
  setRoleModel: (role: ModelRole, model: LLMModel | undefined) => void;
  setRoleBaseUrl: (role: ModelRole, baseUrl: string) => void;
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
  setThinkingVisibility: (visibility: ThinkingVisibility) => void;
  resetGmPrompt: () => void;
  resetStorytellerPrompt: () => void;
  resetContinuePrompt: () => void;
  resetContinueAuthorNote: () => void;
  resetStoryCardGeneratorPrompt: () => void;
  resetAllPromptsToDefault: () => void;
}

const defaultProfiles = createDefaultProfiles();
const defaultModelRoles = createDefaultModelRoles();

export const useSettingsStore = create<SettingsStoreType>()(
  persist<SettingsStoreType>(
    (set, get) => ({
      // Narrator aliases retained for backward compatibility.
      activePreset: ApiPreset.GENERIC,
      profiles: defaultProfiles,
      apiKey: "",
      apiType: ApiType.OPENAI,
      model: undefined,
      openAiBaseUrl: "",
      modelRoles: defaultModelRoles,

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
      thinkingVisibility: "all",

      setActivePreset: (preset: ApiPreset) =>
        get().setRoleActivePreset("narrator", preset),

      setApiKey: (apiKey: string) => get().setRoleApiKey("narrator", apiKey),

      setApiType: (apiType: ApiType) =>
        get().setRoleApiType("narrator", apiType),

      setModel: (model: LLMModel | undefined) =>
        get().setRoleModel("narrator", model),

      setContextWindow: (contextWindow: number) =>
        set({
          contextWindow:
            get().modelContextLength > 0
              ? Math.min(contextWindow, get().modelContextLength)
              : contextWindow,
        }),

      setOpenAiBaseUrl: (openAiBaseUrl: string) =>
        get().setRoleBaseUrl("narrator", openAiBaseUrl),

      setRoleActivePreset: (role: ModelRole, preset: ApiPreset) => {
        set((state) => {
          const current =
            state.modelRoles[role] ?? createDefaultModelRoleSettings();
          const defaults = createDefaultProfiles();
          const profile = current.profiles[preset] ?? defaults[preset];
          const nextRole = syncActiveProfile({
            ...current,
            activePreset: preset,
            profiles: current.profiles[preset]
              ? current.profiles
              : { ...current.profiles, [preset]: profile },
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
            model: profile.model,
          });
          const nextState: Partial<SettingsStoreType> = {
            modelRoles: {
              ...state.modelRoles,
              [role]: nextRole,
            },
          };
          if (role === "narrator") {
            Object.assign(nextState, narratorAliases(nextRole));
          }
          return nextState;
        });
      },

      setRoleApiKey: (role: ModelRole, apiKey: string) => {
        set((state) => {
          const current =
            state.modelRoles[role] ?? createDefaultModelRoleSettings();
          const nextRole = syncActiveProfile({ ...current, apiKey });
          const nextState: Partial<SettingsStoreType> = {
            modelRoles: {
              ...state.modelRoles,
              [role]: nextRole,
            },
          };
          if (role === "narrator") {
            Object.assign(nextState, narratorAliases(nextRole));
          }
          return nextState;
        });
      },

      setRoleApiType: (role: ModelRole, apiType: ApiType) => {
        set((state) => {
          const current =
            state.modelRoles[role] ?? createDefaultModelRoleSettings();
          const nextRole = syncActiveProfile({ ...current, apiType });
          const nextState: Partial<SettingsStoreType> = {
            modelRoles: {
              ...state.modelRoles,
              [role]: nextRole,
            },
          };
          if (role === "narrator") {
            Object.assign(nextState, narratorAliases(nextRole));
          }
          return nextState;
        });
      },

      setRoleModel: (role: ModelRole, model: LLMModel | undefined) => {
        if (model) {
          console.debug(
            `Setting ${role} model: ${model.name} with context window: ${
              model.contextLength ?? "unknown"
            }.`,
          );
        } else {
          console.debug(`Clearing ${role} model selection`);
        }

        set((state) => {
          const current =
            state.modelRoles[role] ?? createDefaultModelRoleSettings();
          const nextRole = syncActiveProfile({ ...current, model });
          const nextState: Partial<SettingsStoreType> = {
            modelRoles: {
              ...state.modelRoles,
              [role]: nextRole,
            },
          };

          if (role === "narrator") {
            const length = model?.contextLength ?? Number.MAX_SAFE_INTEGER;
            Object.assign(nextState, {
              ...narratorAliases(nextRole),
              contextWindow: model
                ? Math.min(state.contextWindow ?? 2048, length)
                : state.contextWindow,
            });
          }

          return nextState;
        });
      },

      setRoleBaseUrl: (role: ModelRole, baseUrl: string) => {
        set((state) => {
          const current =
            state.modelRoles[role] ?? createDefaultModelRoleSettings();
          const nextRole = syncActiveProfile({
            ...current,
            baseUrl,
            model: undefined,
          });
          const nextState: Partial<SettingsStoreType> = {
            modelRoles: {
              ...state.modelRoles,
              [role]: nextRole,
            },
          };
          if (role === "narrator") {
            Object.assign(nextState, narratorAliases(nextRole));
          }
          return nextState;
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
          thinkingVisibility: "all",
        }),
    }),
    {
      name: "settings",
      migrate: migrateSettingsState,
      version: 3,
    },
  ),
);
