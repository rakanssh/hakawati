import type { SettingsTab } from "@/store/useSettingsModalStore";
import type { StoryPanelTab } from "@/store/useStoryPanelStore";
import { GameMode } from "@/types/context.type";
import type {
  AssistantChange,
  AssistantConfirm,
  AssistantConfirmAction,
} from "@/types/assistant.type";
import type { AgentTool } from "../agent-loop";

export interface AssistantUi {
  navigate: (
    to: string,
    options?: {
      search?: Record<string, unknown>;
      state?: Record<string, unknown>;
    },
  ) => Promise<void>;
  openTale: (taleId: string) => Promise<void>;
  forgetTale: (taleId: string) => void;
  showSettings: (tab?: SettingsTab) => void;
  showPanelTab: (tab: StoryPanelTab) => void;
}

export interface AssistantToolContext {
  getPathname: () => string;
  recordChanges?: (changes: AssistantChange[]) => void;
  ui?: AssistantUi;
  confirm?: (request: Omit<AssistantConfirm, "answer">) => Promise<boolean>;
  afterRun?: (task: () => void | Promise<void>) => void;
}

export function requireUi(context: AssistantToolContext): AssistantUi {
  if (!context.ui)
    throw new Error("The app's screens can't be reached from here.");
  return context.ui;
}

export const CANCELLED = { done: false, cancelled: true } as const;

export function ask(
  context: AssistantToolContext,
  action: AssistantConfirmAction,
  names: string[],
): Promise<boolean> {
  if (!context.confirm) throw new Error("The player can't be asked from here.");
  return context.confirm({ action, names });
}

export interface AssistantTool extends AgentTool {
  detail?(args: Record<string, unknown>): string | undefined;
  outcome?(output: unknown): string | undefined;
}

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function defineTool(input: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: AgentTool["run"];
  detail?: AssistantTool["detail"];
  outcome?: AssistantTool["outcome"];
}): AssistantTool {
  return {
    definition: {
      type: "function",
      function: {
        name: input.name,
        description: input.description,
        parameters: input.parameters,
      },
    },
    run: input.run,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
  };
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;

export function integer(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function required(op: Record<string, unknown>, key: string): string {
  const value = text(op[key]);
  if (!value) throw new Error(`${String(op.op)} needs ${key}.`);
  return value;
}

export function opList(
  value: unknown,
  name: string,
  options: { required?: boolean } = {},
): Array<Record<string, unknown>> {
  if (value === undefined && !options.required) return [];
  if (!Array.isArray(value) || (options.required && !value.length))
    throw new Error(`${name} must list at least one change.`);
  return value.map((op) => {
    if (!op || typeof op !== "object" || Array.isArray(op))
      throw new Error(`Each of ${name} must be an object.`);
    return op as Record<string, unknown>;
  });
}

export function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T {
  if (values.includes(value as T)) return value as T;
  throw new Error(`${name} must be one of: ${values.join(", ")}.`);
}

export const MODE_PROPERTY = {
  type: "string",
  enum: ["story_teller", "game_master"],
} as const;

export const AI_INSTRUCTIONS_PROPERTY = {
  type: "string",
  description:
    "A complete prompt for the narrator, used instead of the default.",
} as const;

export const modeName = (mode: GameMode | string) =>
  mode === GameMode.GM ? "game_master" : "story_teller";

export const modeFrom = (value: unknown) =>
  value === "game_master" ? GameMode.GM : GameMode.STORY_TELLER;
