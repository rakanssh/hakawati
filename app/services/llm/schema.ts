import { ResponseMode } from "@/types/api.type";

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
  // Maximum number of completion tokens to generate (provider-specific name: max_tokens)
  max_tokens?: number;
  options?: ChatRequestOptions;
  responseMode: ResponseMode;
}

export interface ChatResponse {
  content: string;
  iterator?: AsyncGenerator<string>;
  raw: unknown;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMClient {
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  models(): Promise<LLMModel[]>;
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
  contextLength: number;
  pricing?: ModelPricing;
  // Capability flags
  supportsResponseFormat?: boolean;
}

export interface LLMAction {
  type:
    | "MODIFY_STAT"
    | "ADD_TO_INVENTORY"
    | "REMOVE_FROM_INVENTORY"
    | "ADD_TO_STATS";
  payload: { name?: string; value?: number; item?: string };
}

export interface LLMResponse {
  story: string;
  actions?: LLMAction[];
}

// JSON schema for GM-mode structured output
// Compatible with OpenAI response_format: { type: "json_schema", json_schema: { name, schema, strict } }
export const GM_RESPONSE_JSON_SCHEMA = {
  name: "gm_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["story", "actions"],
    properties: {
      story: {
        type: "string",
        description: "Narrative continuation of the story",
      },
      actions: {
        type: "array",
        description: "Optional game state changes based on the scene",
        items: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "payload"],
              properties: {
                type: { type: "string", enum: ["MODIFY_STAT"] },
                payload: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "value"],
                  properties: {
                    name: { type: "string" },
                    value: { type: "number" },
                  },
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "payload"],
              properties: {
                type: { type: "string", enum: ["ADD_TO_INVENTORY"] },
                payload: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item"],
                  properties: {
                    item: { type: "string" },
                  },
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "payload"],
              properties: {
                type: { type: "string", enum: ["REMOVE_FROM_INVENTORY"] },
                payload: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item"],
                  properties: {
                    item: { type: "string" },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
  strict: true,
} as const;
