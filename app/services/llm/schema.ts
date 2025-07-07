export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
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
}
