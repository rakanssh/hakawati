import { apiPresetMap, createDefaultProfiles } from "@/data/api-presets";
import type { LLMModel } from "@/services/llm/schema";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "@/services/llm/reasoning";
import { ApiPreset, ApiProfileSettings, MODEL_ROLES, ModelRole } from "@/types";
import {
  DEFAULT_TTS_VOICE,
  type LegacyRoleSettings,
} from "./model-connections";

/** Provider settings as saved by versions before connections. */
export interface LegacyProviderState {
  activePreset?: ApiPreset;
  profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>;
  retiredProfiles?: LegacyRoleSettings["retiredProfiles"];
  apiKey?: string;
  model?: LLMModel;
  openAiBaseUrl?: string;
  modelRoles?: Partial<Record<ModelRole, Partial<LegacyRoleSettings>>>;
}

function mergeProfiles(
  profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>,
): Record<ApiPreset, ApiProfileSettings> {
  const defaults = createDefaultProfiles();
  const merged = { ...defaults };

  for (const key of Object.keys(defaults) as ApiPreset[]) {
    const profile = profiles?.[key];
    if (profile) {
      merged[key] = normalizeProfileReasoning(
        {
          ...defaults[key],
          ...profile,
        },
        key === ApiPreset.CHATGPT,
      );
    }
  }

  return merged;
}

function currentPreset(preset: ApiPreset): ApiPreset {
  return Object.hasOwn(apiPresetMap, preset) ? preset : ApiPreset.GENERIC;
}

function preserveDisplacedProfile(
  savedPreset: ApiPreset,
  profiles?: Partial<Record<ApiPreset, ApiProfileSettings>>,
  retiredProfiles?: LegacyRoleSettings["retiredProfiles"],
): LegacyRoleSettings["retiredProfiles"] {
  const activePreset = currentPreset(savedPreset);
  if (savedPreset === activePreset || !profiles?.[activePreset])
    return retiredProfiles;
  return {
    ...retiredProfiles,
    [activePreset]: { ...profiles[activePreset] },
  };
}

function normalizeProfileReasoning<T extends ApiProfileSettings>(
  profile: T,
  isChatGpt: boolean,
): T {
  return {
    ...profile,
    reasoningEffort: normalizeReasoningEffort(
      profile.reasoningEffort,
      getModelReasoning(
        profile.model,
        reasoningProvider(profile.baseUrl, isChatGpt),
      ),
    ),
  };
}

function syncActiveProfile(config: LegacyRoleSettings): LegacyRoleSettings {
  config = normalizeProfileReasoning(
    config,
    config.activePreset === ApiPreset.CHATGPT,
  );
  return {
    ...config,
    profiles: {
      ...config.profiles,
      [config.activePreset]: {
        ...config.profiles[config.activePreset],
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
      },
    },
  };
}

function createDefaultRoleSettings(role: ModelRole): LegacyRoleSettings {
  const profiles = createDefaultProfiles();
  const profile = profiles[ApiPreset.GENERIC];
  return {
    activePreset: ApiPreset.GENERIC,
    profiles,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    ...(role === "textToSpeech" ? { voice: DEFAULT_TTS_VOICE } : {}),
  };
}

function normalizeRoleSettings(
  input?: Partial<LegacyRoleSettings>,
  fallback?: LegacyRoleSettings,
  role?: ModelRole,
): LegacyRoleSettings {
  const savedPreset =
    input?.activePreset ?? fallback?.activePreset ?? ApiPreset.GENERIC;
  const activePreset = currentPreset(savedPreset);
  const savedProfiles = input?.profiles ?? fallback?.profiles;
  const profiles = mergeProfiles(savedProfiles);
  const activeProfile = {
    ...(savedPreset === activePreset
      ? profiles[activePreset]
      : createDefaultProfiles()[ApiPreset.GENERIC]),
    ...savedProfiles?.[savedPreset],
  };
  // Removed presets continue as a generic endpoint with the existing credentials.
  const inherited = savedPreset === activePreset ? fallback : activeProfile;
  const config: LegacyRoleSettings = {
    activePreset,
    profiles,
    retiredProfiles: preserveDisplacedProfile(
      savedPreset,
      savedProfiles,
      input?.retiredProfiles ?? fallback?.retiredProfiles,
    ),
    baseUrl: input?.baseUrl ?? inherited?.baseUrl ?? activeProfile.baseUrl,
    apiKey: input?.apiKey ?? inherited?.apiKey ?? activeProfile.apiKey,
    model: input?.model ?? inherited?.model ?? activeProfile.model,
    reasoningEffort:
      role === "narrator" || role === "utility"
        ? (input?.reasoningEffort ??
          inherited?.reasoningEffort ??
          activeProfile.reasoningEffort)
        : undefined,
    ...(role === "textToSpeech"
      ? { voice: input?.voice ?? fallback?.voice ?? DEFAULT_TTS_VOICE }
      : {}),
  };

  return syncActiveProfile(config);
}

function createLegacyRoleSettings(
  state: LegacyProviderState,
): LegacyRoleSettings {
  const savedPreset = state.activePreset ?? ApiPreset.GENERIC;
  const activePreset = currentPreset(savedPreset);
  const profiles = mergeProfiles(state.profiles);

  if (!state.profiles && (state.apiKey || state.openAiBaseUrl || state.model)) {
    profiles[ApiPreset.GENERIC] = {
      ...profiles[ApiPreset.GENERIC],
      baseUrl: state.openAiBaseUrl || "",
      apiKey: state.apiKey || "",
      model: state.model,
    };
  }

  const activeProfile = {
    ...(savedPreset === activePreset
      ? profiles[activePreset]
      : createDefaultProfiles()[ApiPreset.GENERIC]),
    ...state.profiles?.[savedPreset],
  };
  return syncActiveProfile({
    activePreset,
    profiles,
    retiredProfiles: preserveDisplacedProfile(
      savedPreset,
      state.profiles,
      state.retiredProfiles,
    ),
    baseUrl: state.openAiBaseUrl ?? activeProfile.baseUrl,
    apiKey: state.apiKey ?? activeProfile.apiKey,
    model: state.model ?? activeProfile.model,
    reasoningEffort: activeProfile.reasoningEffort,
  });
}

/** Reads every role's provider settings from any version that saved them per role or as a single model. */
export function legacyModelRoles(
  state: LegacyProviderState,
): Record<ModelRole, LegacyRoleSettings> {
  const legacyRole = createLegacyRoleSettings(state);

  if (state.modelRoles) {
    return Object.fromEntries(
      MODEL_ROLES.map((role) => [
        role,
        normalizeRoleSettings(
          state.modelRoles?.[role],
          role === "narrator" ? legacyRole : createDefaultRoleSettings(role),
          role,
        ),
      ]),
    ) as Record<ModelRole, LegacyRoleSettings>;
  }

  return {
    narrator: normalizeRoleSettings(legacyRole, undefined, "narrator"),
    utility: normalizeRoleSettings(legacyRole, undefined, "utility"),
    speechToText: createDefaultRoleSettings("speechToText"),
    textToSpeech: createDefaultRoleSettings("textToSpeech"),
  };
}
