export interface AssistantThread {
  id: string;
  taleId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A model-facing message kept with a reply, so later turns can show the model what it did. */
export interface AssistantModelMessage {
  role: "assistant" | "tool";
  content: string;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  replay?: unknown;
}

export interface AssistantActivity {
  tool: string;
  detail?: string;
  error?: string;
}

export type AssistantMessageStatus = "stopped" | "failed";

export interface AssistantMessage {
  id: string;
  threadId: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  turn?: AssistantModelMessage[];
  activity?: AssistantActivity[];
  changes?: unknown[];
  status?: AssistantMessageStatus;
  createdAt: number;
}
