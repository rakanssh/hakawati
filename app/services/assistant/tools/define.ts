import type { SettingsTab } from "@/store/useSettingsModalStore";
import type { StoryPanelTab } from "@/store/useStoryPanelStore";
import type { AssistantChange, AssistantConfirm } from "@/types/assistant.type";
import type { AgentTool } from "../agent-loop";

/** What the chat panel lets tools do to the screen. */
export interface AssistantUi {
  navigate: (
    to: string,
    options?: {
      search?: Record<string, unknown>;
      state?: Record<string, unknown>;
    },
  ) => Promise<void>;
  /** Loads a tale and shows it on the play screen. */
  openTale: (taleId: string) => Promise<void>;
  /** Clears a deleted tale from the play screen and Continue. */
  forgetTale: (taleId: string) => void;
  showSettings: (tab?: SettingsTab) => void;
  showPanelTab: (tab: StoryPanelTab) => void;
}

export interface AssistantToolContext {
  getPathname: () => string;
  recordChanges?: (changes: AssistantChange[]) => void;
  ui?: AssistantUi;
  /** Asks the player with buttons in the chat. Resolves true when they say yes. */
  confirm?: (request: Omit<AssistantConfirm, "answer">) => Promise<boolean>;
  /** Runs once the reply has finished, before it is saved. */
  afterRun?: (task: () => void | Promise<void>) => void;
}

export function requireUi(context: AssistantToolContext): AssistantUi {
  if (!context.ui)
    throw new Error("The app's screens can't be reached from here.");
  return context.ui;
}

export interface AssistantTool extends AgentTool {
  /** A short value shown beside the tool's name in the chat, such as a search query. */
  detail?(args: Record<string, unknown>): string | undefined;
  /** Replaces the detail once the tool has run, such as the name of the tale it opened. */
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
