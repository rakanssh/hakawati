export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  // Maximum number of completion tokens to generate (provider-specific name: max_tokens)
  max_tokens?: number;
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

export interface LLMModel {
  id: string;
  name: string;
  contextLength: number;
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
