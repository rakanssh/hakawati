import { ResponseMode } from "@/types/api.type";
import type { LLMModel, ReasoningEffort } from "@/types/model.type";
import { ToolCall, ToolDefinition } from "./tools";

export type ProviderReplay =
  | { format: "chat"; model: string; fields: Record<string, unknown> }
  | { format: "responses"; model: string; items: unknown[] };

/**
 * Core chat message types
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  replay?: ProviderReplay;
}

export interface ToolNamespace {
  name: string;
  description: string;
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
  reasoningEffort?: ReasoningEffort;
  options?: ChatRequestOptions;
  responseMode: ResponseMode;
  tools?: ToolDefinition[];
  toolNamespace?: ToolNamespace;
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
  replay?: ProviderReplay;
}

export interface LLMClient {
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  models(signal?: AbortSignal): Promise<LLMModel[]>;
  transcribeAudio(
    request: AudioTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<AudioTranscriptionResponse>;
  synthesizeSpeech(
    request: AudioSpeechRequest,
    signal?: AbortSignal,
  ): Promise<AudioSpeechResponse>;
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

export interface AudioSpeechRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: "mp3";
}

export interface AudioSpeechResponse {
  audio: Blob;
  raw: Response;
}
