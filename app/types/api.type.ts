import type { LLMModel, ReasoningEffort } from "@/services/llm/schema";

export enum ApiType {
  OPENAI = "openai",
}

export enum ApiPreset {
  OPENROUTER = "openrouter",
  OPENAI = "openai",
  NANOGPT = "nanogpt",
  CHATGPT = "chatgpt",
  GENERIC = "generic",
  LOCAL = "local",
}

export type ModelRole =
  | "narrator"
  | "utility"
  | "speechToText"
  | "textToSpeech";

export const MODEL_ROLES = [
  "narrator",
  "utility",
  "speechToText",
  "textToSpeech",
] as const satisfies readonly ModelRole[];

export interface ApiProfileSettings {
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
  reasoningEffort?: ReasoningEffort;
}

export interface ModelRoleSettings {
  apiType: ApiType;
  activePreset: ApiPreset;
  profiles: Record<ApiPreset, ApiProfileSettings>;
  /** Settings displaced by a retired preset migration; never selectable. */
  retiredProfiles?: Record<string, ApiProfileSettings>;
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
  reasoningEffort?: ReasoningEffort;
  voice?: string;
}

export enum ResponseMode {
  TOOL_CALLING = "tool_calling",
  FREE_FORM = "free_form",
}
