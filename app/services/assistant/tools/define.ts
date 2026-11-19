import type { AssistantChange } from "@/types/assistant.type";
import type { AgentTool } from "../agent-loop";

export interface AssistantToolContext {
  getPathname: () => string;
  recordChanges?: (changes: AssistantChange[]) => void;
}

export interface AssistantTool extends AgentTool {
  /** A short value shown beside the tool's name in the chat, such as a search query. */
  detail?(args: Record<string, unknown>): string | undefined;
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
