import type { PromptComponentType, Scenario, StoryCard } from "./context.type";
import type { Item } from "./item.type";
import type { LogEntry } from "./log.type";
import type { Stat } from "./stats.type";

export type TaleField = "name" | "description" | "gameMode";

/** One edit Hakawati made to a tale, with enough of the before and after to undo it later. */
export type TaleChange = { taleId: string; undone?: boolean } & (
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

export type ScenarioRecord = Omit<Scenario, "thumbnail">;

/** Hakawati's edits to one scenario in one step: in the library, or in the form open in the scenario editor. */
export type ScenarioChange = {
  kind: "scenario";
  undone?: boolean;
  target: "library" | "draft";
  /** Empty for a new scenario that has not been saved yet. */
  scenarioId: string;
  before: ScenarioRecord | null;
  after: ScenarioRecord;
};

export type AssistantChange = TaleChange | ScenarioChange;

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
  /** Where in the reply's text the step happened. */
  at?: number;
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
