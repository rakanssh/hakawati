import { LLMAction } from "@/types/log.type";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

/**
 * OpenAI tool definitions for Game Master mode
 */
export const GM_TOOLS: ToolDefinition[] = [
  {
    type: "function" as const,
    function: {
      name: "modify_stat",
      description:
        "Modify a player's stat by a specific amount. Use when story events affect player stats (damage, healing, stat changes).",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the stat to modify (e.g., 'HP', 'Mana')",
          },
          value: {
            type: "number",
            description:
              "The amount to change the stat by (positive or negative)",
          },
        },
        required: ["name", "value"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_to_inventory",
      description:
        "Add an item to the player's inventory. Use when the player acquires, finds, or is given an item.",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "The name of the item to add (keep concise)",
          },
        },
        required: ["item"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_from_inventory",
      description:
        "Remove an item from the player's inventory. Use when the player loses, consumes, or discards an item.",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "The name of the item to remove",
          },
        },
        required: ["item"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];

/**
 * OpenAI tool call structure
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

function parseArgs(raw: string | undefined): Record<string, unknown> | null {
  try {
    const args: unknown = JSON.parse(raw ?? "");
    return args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toAction(
  name: string,
  args: Record<string, unknown>,
): LLMAction | null {
  switch (name) {
    case "modify_stat":
      return typeof args.name === "string" && typeof args.value === "number"
        ? {
            type: "MODIFY_STAT",
            payload: { name: args.name, value: args.value },
          }
        : null;
    case "add_to_inventory":
      return typeof args.item === "string"
        ? { type: "ADD_TO_INVENTORY", payload: { item: args.item } }
        : null;
    case "remove_from_inventory":
      return typeof args.item === "string"
        ? { type: "REMOVE_FROM_INVENTORY", payload: { item: args.item } }
        : null;
    default:
      return null;
  }
}

export function convertToolCallsToActions(toolCalls: ToolCall[]): {
  actions: LLMAction[];
  failed: ToolCall[];
} {
  const actions: LLMAction[] = [];
  const failed: ToolCall[] = [];
  for (const call of toolCalls) {
    const args = parseArgs(call.function.arguments);
    const action = args && toAction(call.function.name, args);
    if (action) actions.push(action);
    else failed.push(call);
  }
  return { actions, failed };
}
