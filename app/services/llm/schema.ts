import { ResponseMode } from "@/types/api.type";
import { ToolCall } from "./tools";

/**
 * Core chat message types
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequestOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  minP?: number;
  topA?: number;
  seed?: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  options?: ChatRequestOptions;
  responseMode: ResponseMode;
}

/**
 * Streaming chunk types
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamChunk {
  content?: string;
  thinking?: string;
  tool_calls?: ToolCallDelta[];
}

export interface ChatResponse {
  content: string;
  thinking?: string;
  iterator?: AsyncGenerator<StreamChunk>;
  raw: unknown;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: ToolCall[];
}

export interface LLMClient {
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  models(signal?: AbortSignal): Promise<LLMModel[]>;
  transcribeAudio(
    request: AudioTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<AudioTranscriptionResponse>;
}

export interface AudioTranscriptionRequest {
  model: string;
  file: Blob;
  filename?: string;
  response_format?: "json";
}

export interface AudioTranscriptionResponse {
  text: string;
  raw: unknown;
}

/**
 * Model types
 */
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
}

/**
 * Action types for game state modifications
 */
export interface LLMAction {
  type:
    | "MODIFY_STAT"
    | "ADD_TO_INVENTORY"
    | "REMOVE_FROM_INVENTORY"
    | "ADD_TO_STATS";
  payload: {
    name?: string;
    value?: number;
    item?: string;
    description?: string;
  };
}

/**
 * Response format used by decoders (backward compatibility)
 */
export interface LLMResponse {
  story: string;
  actions?: LLMAction[];
}
