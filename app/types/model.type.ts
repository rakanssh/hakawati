export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ReasoningCapabilities {
  supportedEfforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  mandatory?: boolean;
}

export interface ModelPricing {
  prompt: number;
  completion: number;
  request: number;
  image: number;
  audio: number;
}

export interface LLMModel {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: ModelPricing;
  supportsResponseFormat?: boolean;
  supportsToolCalls?: boolean;
  supportedParameters?: string[];
  supportedVoices?: string[];
  /** Missing metadata means unknown; an empty list explicitly has no selector. */
  reasoning?: ReasoningCapabilities;
  maxOutputTokens?: number;
  /** Typed in by the player rather than picked from the provider's list. */
  manual?: boolean;
}
