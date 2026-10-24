import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "@/lib/appearance-limits";
import { apiPresetMap, isPresetAllowedForRole } from "@/data/api-presets";
import {
  ApiConnection,
  ApiPreset,
  ApiType,
  LLMModel,
  ModelRole,
  ModelRoleSettings,
  ReasoningEffort,
} from "@/types";
import type { Locale } from "@/i18n";
import {
  THEME_FONT,
  isThemeScenery,
  type ThemeScenery,
} from "@/themes/registry";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_TTS_VOICE,
  connectionsFromLegacyRoles,
  createConnection,
  createDefaultRoleAssignments,
  findConnection,
  findMatchingConnection,
  normalizeChoice,
  normalizeConnections,
  normalizeRoleAssignments,
  resolveModelRoles,
  switchConnection,
  updateChoicesOn,
  usesReasoning,
  type NewConnection,
  type RoleAssignments,
} from "./model-connections";
import {
  legacyModelRoles,
  type LegacyProviderState,
} from "./legacy-model-roles";

export type TextDirection = "system" | "ltr" | "rtl";

const SETTINGS_VERSION = 8;
export type ThinkingVisibility = "all" | "latest" | "none";

export { DEFAULT_TTS_VOICE };

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

type PersistedSettingsState = Partial<SettingsStoreType> &
  LegacyProviderState & {
    showThinkingInLog?: boolean;
    thinkingVisibility?: ThinkingVisibility;
    autoNarrate?: boolean;
    highlightLatestSection?: boolean;
    themeScenery?: ThemeScenery;
  };

type RoleState = Pick<
  SettingsStoreType,
  "connections" | "roleAssignments" | "modelRoles" | "modelContextLength"
>;

/** Recomputes what each role resolves to after its connections or assignments change. */
function roleState(
  connections: ApiConnection[],
  roleAssignments: RoleAssignments,
  previous?: Partial<Record<ModelRole, ModelRoleSettings>>,
): RoleState {
  const modelRoles = resolveModelRoles(connections, roleAssignments, previous);
  return {
    connections,
    roleAssignments,
    modelRoles,
    modelContextLength: modelRoles.narrator.model?.contextLength ?? 0,
  };
}

// Fields the store derives on load; earlier versions also saved provider settings at the top level.
const DERIVED_KEYS = [
  "modelRoles",
  "modelContextLength",
  "activePreset",
  "profiles",
  "retiredProfiles",
  "apiKey",
  "apiType",
  "model",
  "openAiBaseUrl",
] as const;

export function migrateSettingsState(
  persistedState: unknown,
  version = SETTINGS_VERSION,
): SettingsStoreType {
  const state = (persistedState ?? {}) as PersistedSettingsState;
  const { connections, roleAssignments } = Array.isArray(state.connections)
    ? {
        connections: normalizeConnections(state.connections),
        roleAssignments: normalizeRoleAssignments(state.roleAssignments),
      }
    : connectionsFromLegacyRoles(legacyModelRoles(state));

  const rest: Record<string, unknown> = { ...state };
  for (const key of DERIVED_KEYS) delete rest[key];
  const thinkingVisibility: ThinkingVisibility =
    state.thinkingVisibility ??
    (state.showThinkingInLog === false ? "none" : "all");

  return {
    ...rest,
    ...roleState(connections, roleAssignments),
    textDirection: state.textDirection ?? "system",
    language: state.language ?? "en",
    thinkingVisibility,
    autoNarrate: state.autoNarrate ?? false,
    highlightLatestSection: state.highlightLatestSection ?? true,
    themeScenery: isThemeScenery(state.themeScenery)
      ? state.themeScenery
      : undefined,
    // Before themes had their own type, "system-ui" was simply the default; let themes choose instead.
    fontFamily:
      version < 7 && (!state.fontFamily || state.fontFamily === "system-ui")
        ? THEME_FONT
        : (state.fontFamily ?? THEME_FONT),
  } as SettingsStoreType;
}

export function isModelRoleConfigured(config: ModelRoleSettings): boolean {
  return Boolean(
    config.apiType === ApiType.OPENAI && config.baseUrl.trim() && config.model,
  );
}

export interface SettingsStoreType {
  /** Saved provider accounts that the roles share. */
  connections: ApiConnection[];
  roleAssignments: RoleAssignments;
  /** Each role resolved against its connection. Derived on load, never saved. */
  modelRoles: Record<ModelRole, ModelRoleSettings>;

  // Global settings
  contextWindow: number;
  /** The narrator model's context length. Derived on load, never saved. */
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
  autoNarrate: boolean;
  highlightLatestSection: boolean;
  /** The reader's scenery choice. Unset follows the system's reduced-motion preference. */
  themeScenery?: ThemeScenery;
  chatGptPlanNoticeAcknowledged: boolean;
  acknowledgeChatGptPlanNotice: () => void;

  setContextWindow: (contextWindow: number) => void;
  /** Saves a connection, or returns the existing one to the same account. */
  addConnection: (connection: NewConnection) => string;
  updateConnection: (
    id: string,
    patch: Partial<Pick<ApiConnection, "baseUrl" | "apiKey">>,
  ) => void;
  removeConnection: (id: string) => void;
  setRoleConnection: (role: ModelRole, connectionId: string | null) => void;
  setUtilitySameAsNarrator: (same: boolean) => void;
  setRoleModel: (role: ModelRole, model: LLMModel | undefined) => void;
  setRoleReasoningEffort: (role: ModelRole, effort?: ReasoningEffort) => void;
  setRoleVoice: (role: ModelRole, voice: string) => void;
  chatGptProfileId: string | null;
  clearChatGptModels: (profileId?: string | null) => void;
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
  resetGenerationSettings: () => void;
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
  setAutoNarrate: (autoNarrate: boolean) => void;
  setHighlightLatestSection: (highlight: boolean) => void;
  setThemeScenery: (scenery: ThemeScenery) => void;
  resetGmPrompt: () => void;
  resetStorytellerPrompt: () => void;
  resetContinuePrompt: () => void;
  resetContinueAuthorNote: () => void;
  resetStoryCardGeneratorPrompt: () => void;
  resetAllPromptsToDefault: () => void;
}

type SavedSettings = Omit<
  SettingsStoreType,
  "modelRoles" | "modelContextLength"
>;

export const useSettingsStore = create<SettingsStoreType>()(
  persist<SettingsStoreType, [], [], SavedSettings>(
    (set, get) => ({
      ...roleState([], createDefaultRoleAssignments()),
      chatGptProfileId: null,

      // Global settings
      contextWindow: 10000,
      modelContextLength: 0,
      maxTokens: 2048,
      seed: Math.floor(Math.random() * 1000000),
      uiScale: 1,
      fontFamily: THEME_FONT,
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
      autoNarrate: false,
      highlightLatestSection: true,
      themeScenery: undefined,
      chatGptPlanNoticeAcknowledged: false,
      acknowledgeChatGptPlanNotice: () =>
        set({ chatGptPlanNoticeAcknowledged: true }),

      setContextWindow: (contextWindow: number) =>
        set({
          contextWindow:
            get().modelContextLength > 0
              ? Math.min(contextWindow, get().modelContextLength)
              : contextWindow,
        }),

      addConnection: (input: NewConnection) => {
        const state = get();
        const connection = createConnection(input);
        const existing = findMatchingConnection(state.connections, connection);
        if (existing) return existing.id;
        set(
          roleState(
            [...state.connections, connection],
            state.roleAssignments,
            state.modelRoles,
          ),
        );
        return connection.id;
      },

      updateConnection: (id, patch) =>
        set((state) => {
          const current = findConnection(state.connections, id);
          if (!current) return {};
          const next = {
            ...current,
            baseUrl: apiPresetMap[current.preset].editableUrl
              ? (patch.baseUrl ?? current.baseUrl).trim()
              : current.baseUrl,
            apiKey: (patch.apiKey ?? current.apiKey).trim(),
          };
          let roleAssignments = state.roleAssignments;
          if (next.baseUrl !== current.baseUrl) {
            // Another server offers other models.
            roleAssignments = updateChoicesOn(roleAssignments, id, () => ({
              model: undefined,
            }));
          } else if (next.apiKey !== current.apiKey) {
            // Another account may offer other thinking levels.
            roleAssignments = updateChoicesOn(
              roleAssignments,
              id,
              (choice) => ({ ...choice, reasoningEffort: undefined }),
            );
          }
          return roleState(
            state.connections.map((c) => (c.id === id ? next : c)),
            roleAssignments,
            state.modelRoles,
          );
        }),

      removeConnection: (id) =>
        set((state) =>
          roleState(
            state.connections.filter((c) => c.id !== id),
            updateChoicesOn(state.roleAssignments, id, () => undefined),
            state.modelRoles,
          ),
        ),

      setRoleConnection: (role, connectionId) =>
        set((state) => {
          const connection = findConnection(state.connections, connectionId);
          if (
            connectionId &&
            (!connection || !isPresetAllowedForRole(connection.preset, role))
          ) {
            return {};
          }
          const next = switchConnection(
            state.roleAssignments[role],
            connectionId,
          );
          return roleState(
            state.connections,
            {
              ...state.roleAssignments,
              [role]:
                role === "utility" ? { ...next, sameAsNarrator: false } : next,
            },
            state.modelRoles,
          );
        }),

      setUtilitySameAsNarrator: (same) =>
        set((state) => {
          const { narrator, utility } = state.roleAssignments;
          if (Boolean(utility.sameAsNarrator) === same) return {};
          // A utility that never had its own connection starts from the narrator's.
          const own =
            same || utility.connectionId
              ? utility
              : {
                  ...utility,
                  connectionId: narrator.connectionId,
                  model: narrator.model,
                  reasoningEffort: narrator.reasoningEffort,
                };
          return roleState(
            state.connections,
            {
              ...state.roleAssignments,
              utility: { ...own, sameAsNarrator: same },
            },
            state.modelRoles,
          );
        }),

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
          const current = state.roleAssignments[role];
          const next = normalizeChoice(
            { ...current, model },
            findConnection(state.connections, current.connectionId),
          );
          const length = model?.contextLength ?? Number.MAX_SAFE_INTEGER;
          return {
            ...roleState(
              state.connections,
              { ...state.roleAssignments, [role]: next },
              state.modelRoles,
            ),
            ...(role === "narrator" && model
              ? { contextWindow: Math.min(state.contextWindow ?? 2048, length) }
              : {}),
          };
        });
      },

      setRoleReasoningEffort: (role: ModelRole, effort?: ReasoningEffort) => {
        if (!usesReasoning(role)) return;
        set((state) => {
          const current = state.roleAssignments[role];
          const next = normalizeChoice(
            { ...current, reasoningEffort: effort },
            findConnection(state.connections, current.connectionId),
          );
          return roleState(
            state.connections,
            { ...state.roleAssignments, [role]: next },
            state.modelRoles,
          );
        });
      },

      setRoleVoice: (role: ModelRole, voice: string) =>
        set((state) =>
          roleState(
            state.connections,
            {
              ...state.roleAssignments,
              [role]: { ...state.roleAssignments[role], voice },
            },
            state.modelRoles,
          ),
        ),

      clearChatGptModels: (profileId = null) =>
        set((state) => {
          let roleAssignments = state.roleAssignments;
          for (const connection of state.connections) {
            if (connection.preset !== ApiPreset.CHATGPT) continue;
            roleAssignments = updateChoicesOn(
              roleAssignments,
              connection.id,
              () => ({ model: undefined }),
            );
          }
          return {
            ...roleState(state.connections, roleAssignments, state.modelRoles),
            chatGptProfileId: profileId,
          };
        }),

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
          const clamped = Math.min(
            Math.max(normalized, UI_SCALE_MIN),
            UI_SCALE_MAX,
          );
          return { uiScale: Number(clamped.toFixed(2)) };
        }),
      setFontFamily: (fontFamily: string) => set({ fontFamily }),
      setFontSize: (fontSize: number) =>
        set(() => {
          const isFiniteNumber = Number.isFinite(fontSize);
          const normalized = isFiniteNumber ? fontSize : 1;
          const clamped = Math.min(
            Math.max(normalized, FONT_SIZE_MIN),
            FONT_SIZE_MAX,
          );
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
      setAutoNarrate: (autoNarrate: boolean) => set({ autoNarrate }),
      setHighlightLatestSection: (highlight: boolean) =>
        set({ highlightLatestSection: highlight }),
      setThemeScenery: (themeScenery: ThemeScenery) => set({ themeScenery }),
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
      resetGenerationSettings: () =>
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
        }),
    }),
    {
      name: "settings",
      migrate: migrateSettingsState,
      version: SETTINGS_VERSION,
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) => key !== "modelRoles" && key !== "modelContextLength",
          ),
        ) as SavedSettings,
      // What each role resolves to is rebuilt from the saved connections and assignments.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<SavedSettings>) };
        return {
          ...merged,
          ...roleState(
            normalizeConnections(merged.connections),
            normalizeRoleAssignments(merged.roleAssignments),
          ),
        };
      },
    },
  ),
);
