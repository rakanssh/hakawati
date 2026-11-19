import type { PromptComponentType, StoryCard } from "./context.type";
import type { Item } from "./item.type";
import type { LogEntry } from "./log.type";
import type { Stat } from "./stats.type";

export type TaleField = "name" | "description" | "gameMode";

/** One edit Hakawati made, with enough of the before and after to undo it later. */
export type AssistantChange = { taleId: string; undone?: boolean } & (
  | { kind: "field"; field: TaleField; before: string; after: string }
  | {
      kind: "component";
      type: PromptComponentType;
      before: string | null;
      after: string | null;
    }
  | {
      kind: "card";
      id: string;
      before: StoryCard | null;
      after: StoryCard | null;
    }
  | { kind: "stat"; before: Stat | null; after: Stat | null }
  | { kind: "item"; id: string; before: Item | null; after: Item | null }
  | { kind: "passage"; id: string; before: string; after: string }
  | { kind: "insert"; afterId: string | null; entries: LogEntry[] }
  | {
      kind: "delete";
      previousId: string | null;
      nextId: string | null;
      entries: LogEntry[];
    }
);

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
  changes?: AssistantChange[];
  status?: AssistantMessageStatus;
  createdAt: number;
}
