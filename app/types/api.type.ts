import type { LLMModel } from "@/services/llm/schema";

export enum ApiType {
  OPENAI = "openai",
}

export enum ApiPreset {
  OPENROUTER = "openrouter",
  OPENAI = "openai",
  NANOGPT = "nanogpt",
  VENICE = "venice",
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
}

export interface ModelRoleSettings {
  apiType: ApiType;
  activePreset: ApiPreset;
  profiles: Record<ApiPreset, ApiProfileSettings>;
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
}

export enum ResponseMode {
  TOOL_CALLING = "tool_calling",
  FREE_FORM = "free_form",
}
