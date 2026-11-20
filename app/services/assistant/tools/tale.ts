import { errorMessage } from "@/lib/errors";
import { GameMode, LogEntryMode, PromptComponentType } from "@/types";
import type { AssistantChange } from "@/types/assistant.type";
import {
  deletePassages,
  editTaleSetup,
  insertPassages,
  rewritePassage,
  toLogEntry,
  withTaleWrites,
  type NewPassage,
} from "../tale-edits";
import {
  defineTool,
  MODE_PROPERTY,
  modeFrom,
  objectSchema,
  opList,
  optionalString,
  required,
  strings,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import {
  applyCardOps,
  applyItemOps,
  applyStatOps,
  CARD_OP_SCHEMA,
  ITEM_OP_SCHEMA,
  STAT_OP_SCHEMA,
} from "./ops";
import { taleIdFor, taleIdProperty } from "./read";

const COMPONENTS = [
  ["plot", PromptComponentType.PLOT],
  ["authorNote", PromptComponentType.AUTHOR_NOTE],
  ["aiInstructions", PromptComponentType.AI_INSTRUCTIONS],
] as const;

export function createTaleTools(
  context: AssistantToolContext,
): AssistantTool[] {
  const record = (changes: AssistantChange[]) => {
    if (changes.length) context.recordChanges?.(changes);
    return changes;
  };

  return [
    defineTool({
      name: "edit_tale",
      description:
        "Change a tale's setup: name, description, plot, author's note, AI instructions, mode, story cards, and in Game Master mode its stats and inventory. Leave out what stays the same; an empty string clears plot, author's note or AI instructions. The narrator sees a story card when one of its triggers comes up in the story, or always when it is pinned. Add many cards over several calls.",
      parameters: objectSchema({
        ...taleIdProperty,
        name: { type: "string" },
        description: { type: "string" },
        mode: MODE_PROPERTY,
        plot: { type: "string" },
        authorNote: { type: "string" },
        aiInstructions: { type: "string" },
        cards: { type: "array", items: CARD_OP_SCHEMA },
        stats: { type: "array", items: STAT_OP_SCHEMA },
        items: {
          type: "array",
          description: "Inventory.",
          items: ITEM_OP_SCHEMA,
        },
      }),
      run: async (args, signal) => {
        const name = optionalString(args.name);
        if (name !== undefined && !name.trim())
          throw new Error("name cannot be empty.");
        const cards = opList(args.cards, "cards");
        const stats = opList(args.stats, "stats");
        const items = opList(args.items, "items");
        let addedCards: Array<{ id: string; title: string }> = [];
        let addedItems: Array<{ id: string; name: string }> = [];
        const changes = await withTaleWrites(signal, async () =>
          record(
            await editTaleSetup(taleIdFor(args, context), (tale) => {
              if (name !== undefined) tale.setField("name", name.trim());
              const description = optionalString(args.description);
              if (description !== undefined)
                tale.setField("description", description);
              if (args.mode !== undefined)
                tale.setField("gameMode", modeFrom(args.mode));
              for (const [key, type] of COMPONENTS) {
                const value = optionalString(args[key]);
                if (value !== undefined) tale.setComponent(type, value);
              }
              addedCards = applyCardOps(tale, cards);
              if (
                (stats.length || items.length) &&
                tale.tale.gameMode !== GameMode.GM
              )
                throw new Error(
                  "Stats and inventory are only used in Game Master mode. Set mode to game_master as well if the player wants that.",
                );
              applyStatOps(tale, stats);
              addedItems = applyItemOps(tale, items);
            }),
          ),
        );
        return {
          changed: changes.length,
          ...(addedCards.length ? { addedCards } : {}),
          ...(addedItems.length ? { addedItems } : {}),
        };
      },
    }),
    defineTool({
      name: "edit_log",
      description:
        "Rewrite, add or remove passages in a tale's story, by passage id. Ops run in order. Removing a passage does not undo the stat or item changes that came with it.",
      parameters: objectSchema(
        {
          ...taleIdProperty,
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["add", "update", "remove"] },
                id: {
                  type: "string",
                  description: "update: the passage to rewrite.",
                },
                text: { type: "string", description: "update: the new text." },
                after: {
                  type: "string",
                  description: 'add: the passage id to add after, or "start".',
                },
                passages: {
                  type: "array",
                  description: "add: the passages to add, in order.",
                  items: {
                    type: "object",
                    properties: {
                      by: { type: "string", enum: ["narrator", "player"] },
                      mode: {
                        type: "string",
                        enum: ["do", "say", "direct"],
                        description: "For the player's passages.",
                      },
                      text: { type: "string" },
                    },
                    required: ["by", "text"],
                  },
                },
                ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "remove: the passages to remove.",
                },
              },
              required: ["op"],
            },
          },
        },
        ["ops"],
      ),
      run: async (args, signal) => {
        const list = opList(args.ops, "ops", { required: true });
        const taleId = taleIdFor(args, context);
        const added: string[] = [];
        let changed = 0;
        const apply = async (op: Record<string, unknown>) => {
          if (op.op === "update") {
            const textValue = optionalString(op.text);
            if (!textValue?.trim()) throw new Error("update needs text.");
            changed += record([
              await rewritePassage(taleId, required(op, "id"), textValue),
            ]).length;
          } else if (op.op === "add") {
            const after = required(op, "after");
            const passages = Array.isArray(op.passages)
              ? op.passages.flatMap((p): NewPassage[] => {
                  const passage = p as Record<string, unknown>;
                  const value = optionalString(passage?.text);
                  if (!value?.trim()) return [];
                  const mode = Object.values(LogEntryMode).find(
                    (m) => m === passage.mode,
                  );
                  return [
                    {
                      by: passage.by === "player" ? "player" : "narrator",
                      ...(mode ? { mode } : {}),
                      text: value,
                    },
                  ];
                })
              : [];
            if (!passages.length)
              throw new Error("add needs passages with text.");
            const entries = passages.map(toLogEntry);
            changed += record([
              await insertPassages(
                taleId,
                after === "start" ? null : after,
                entries,
              ),
            ]).length;
            added.push(...entries.map((entry) => entry.id));
          } else if (op.op === "remove") {
            const ids = strings(op.ids) ?? [];
            if (!ids.length) throw new Error("remove needs ids.");
            changed += record(await deletePassages(taleId, ids)).length;
          } else throw new Error("op must be add, update or remove.");
        };
        await withTaleWrites(signal, async () => {
          for (const [index, op] of list.entries()) {
            try {
              await apply(op);
            } catch (error) {
              if (!index) throw error;
              throw new Error(
                `Op ${index + 1} failed: ${errorMessage(error).replace(/\.?$/, ".")} The ops before it were applied${added.length ? `, adding ${added.join(", ")}` : ""}; don't repeat them.`,
              );
            }
          }
        });
        return { changed, ...(added.length ? { added } : {}) };
      },
    }),
  ];
}
