import type { LLMModel, ReasoningEffort } from "./model.type";

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

/** A provider profile as stored before connections; read only by settings migration. */
export interface ApiProfileSettings {
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
  reasoningEffort?: ReasoningEffort;
}

/** A saved provider account that any role can use. */
export interface ApiConnection {
  id: string;
  preset: ApiPreset;
  /** Only presets with an editable address use this; the others use their own. */
  baseUrl: string;
  apiKey: string;
  /** The server's name when local discovery found it, such as Ollama. */
  label?: string;
}

export interface RoleModelChoice {
  model: LLMModel | undefined;
  reasoningEffort?: ReasoningEffort;
}

export interface ModelRoleAssignment extends RoleModelChoice {
  connectionId: string | null;
  /** Utility only: use the narrator's connection, model, and thinking level. */
  sameAsNarrator?: boolean;
  voice?: string;
  /** The choice made on each other connection, restored when the role switches back. */
  savedModels?: Record<string, RoleModelChoice>;
}

/** A role's assignment resolved against its connection. Change it through the settings store's actions. */
export interface ModelRoleSettings {
  connectionId: string | null;
  apiType: ApiType;
  activePreset: ApiPreset;
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
