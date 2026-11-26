import type { PromptComponentType, Scenario, StoryCard } from "./context.type";
import type { ModelRole, ModelRoleAssignment } from "./api.type";
import type { Item } from "./item.type";
import type { LogEntry } from "./log.type";
import type { Stat } from "./stats.type";

export type TaleField = "name" | "description" | "gameMode";

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
  | {
      kind: "passage";
      id: string;
      before: string;
      after: string;
      recapBefore?: string[];
    }
  | { kind: "insert"; afterId: string | null; entries: LogEntry[] }
  | {
      kind: "delete";
      previousId: string | null;
      nextId: string | null;
      entries: LogEntry[];
    }
);

export type ScenarioRecord = Omit<Scenario, "thumbnail">;

export type ScenarioChange = {
  kind: "scenario";
  undone?: boolean;
  target: "library" | "draft";
  /** Empty for a new scenario that has not been saved yet. */
  scenarioId: string;
  before: ScenarioRecord | null;
  after: ScenarioRecord;
};

export type SettingChange = {
  kind: "setting";
  undone?: boolean;
  key: string;
  before: unknown;
  after: unknown;
};

export type RoleChange = {
  kind: "role";
  undone?: boolean;
  role: ModelRole;
  before: ModelRoleAssignment;
  after: ModelRoleAssignment;
  label: string;
  contextWindow?: { before: number; after: number };
};

export type AppChange = SettingChange | RoleChange;

export type AssistantChange = TaleChange | ScenarioChange | AppChange;

export type AssistantConfirmAction =
  | "delete_tales"
  | "delete_scenarios"
  | "remove_from_cloud"
  | "keep_local"
  | "keep_cloud"
  | "unpublish";

export interface AssistantConfirm {
  action: AssistantConfirmAction;
  names: string[];
  answer?: "yes" | "no";
}

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
  at?: number;
  action?: string;
  result?: string;
  changed?: boolean;
  confirm?: AssistantConfirm;
}

export type AssistantMessageStatus = "stopped" | "failed" | "paused";

export interface AssistantMessage {
  id: string;
  threadId: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  thinking?: string;
  turn?: AssistantModelMessage[];
  activity?: AssistantActivity[];
  changes?: AssistantChange[];
  status?: AssistantMessageStatus;
  createdAt: number;
}
