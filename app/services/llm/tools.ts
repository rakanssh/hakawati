import { LLMAction } from "./schema";

/**
 * OpenAI tool definitions for Game Master mode
 */
export const GM_TOOLS = [
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

/**
 * Convert OpenAI tool calls to internal LLMAction format
 */
export function convertToolCallsToActions(toolCalls: ToolCall[]): LLMAction[] {
  const actions: LLMAction[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") continue;

    const functionName = toolCall.function.name;
    const rawArgs = toolCall.function.arguments?.trim();

    // Skip empty or incomplete arguments
    if (!rawArgs || rawArgs.length === 0) {
      console.warn(`Empty arguments for tool call: ${functionName}`);
      continue;
    }

    let args: Record<string, unknown>;

    try {
      args = JSON.parse(rawArgs);
    } catch (e) {
      console.warn(
        `Failed to parse tool call arguments for ${functionName}:`,
        rawArgs,
        e,
      );
      continue;
    }

    switch (functionName) {
      case "modify_stat": {
        const name = args.name;
        const value = args.value;
        if (typeof name === "string" && typeof value === "number") {
          actions.push({
            type: "MODIFY_STAT",
            payload: { name, value },
          });
        }
        break;
      }
      case "add_to_inventory": {
        const item = args.item;
        if (typeof item === "string") {
          actions.push({
            type: "ADD_TO_INVENTORY",
            payload: { item },
          });
        }
        break;
      }
      case "remove_from_inventory": {
        const item = args.item;
        if (typeof item === "string") {
          actions.push({
            type: "REMOVE_FROM_INVENTORY",
            payload: { item },
          });
        }
        break;
      }
      default:
        console.warn(`Unknown tool function: ${functionName}`);
    }
  }

  return actions;
}
