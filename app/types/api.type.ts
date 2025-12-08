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

export interface ApiProfileSettings {
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
}

export enum ResponseMode {
  TOOL_CALLING = "tool_calling",
  FREE_FORM = "free_form",
}
