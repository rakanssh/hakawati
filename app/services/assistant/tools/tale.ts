import { GameMode, LogEntryMode, PromptComponentType } from "@/types";
import type { AssistantChange } from "@/types/assistant.type";
import type { TaleChanges } from "../tale-changes";
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
  addItemFrom,
  applyCardOps,
  CARD_OP_SCHEMA,
  setStatFrom,
  updateItemFrom,
} from "./ops";
import { taleIdFor, taleIdProperty } from "./read";

const ops = (args: Record<string, unknown>) =>
  opList(args.ops, "ops", { required: true });

const describeChanges = (changes: AssistantChange[]) => ({
  changed: changes.length,
});

export function createTaleTools(
  context: AssistantToolContext,
): AssistantTool[] {
  const record = (changes: AssistantChange[]) => {
    if (changes.length) context.recordChanges?.(changes);
    return changes;
  };
  const setup = (
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
    edit: (changes: TaleChanges) => void,
  ) =>
    withTaleWrites(signal, async () =>
      record(await editTaleSetup(taleIdFor(args, context), edit)),
    );

  return [
    defineTool({
      name: "update_tale",
      description:
        "Change a tale's name, description, plot, author's note, AI instructions or mode. Leave out what stays the same; an empty string clears plot, author's note or AI instructions.",
      parameters: objectSchema({
        ...taleIdProperty,
        name: { type: "string" },
        description: { type: "string" },
        plot: { type: "string" },
        authorNote: { type: "string" },
        aiInstructions: { type: "string" },
        mode: MODE_PROPERTY,
      }),
      run: async (args, signal) => {
        const name = optionalString(args.name);
        if (name !== undefined && !name.trim())
          throw new Error("name cannot be empty.");
        const changes = await setup(args, signal, (tale) => {
          if (name !== undefined) tale.setField("name", name.trim());
          const description = optionalString(args.description);
          if (description !== undefined)
            tale.setField("description", description);
          for (const [key, type] of [
            ["plot", PromptComponentType.PLOT],
            ["authorNote", PromptComponentType.AUTHOR_NOTE],
            ["aiInstructions", PromptComponentType.AI_INSTRUCTIONS],
          ] as const) {
            const value = optionalString(args[key]);
            if (value !== undefined) tale.setComponent(type, value);
          }
          if (args.mode !== undefined)
            tale.setField("gameMode", modeFrom(args.mode));
        });
        return describeChanges(changes);
      },
    }),
    defineTool({
      name: "edit_story_cards",
      description:
        "Add, change or remove a tale's story cards in one go. The narrator sees a card when one of its triggers comes up in the story, or always when it is pinned.",
      parameters: objectSchema(
        {
          ...taleIdProperty,
          ops: { type: "array", items: CARD_OP_SCHEMA },
        },
        ["ops"],
      ),
      run: async (args, signal) => {
        const list = ops(args);
        let added: Array<{ id: string; title: string }> = [];
        const changes = await setup(args, signal, (tale) => {
          added = applyCardOps(tale, list);
        });
        return { ...describeChanges(changes), added };
      },
    }),
    defineTool({
      name: "edit_character",
      description:
        "Change a Game Master tale's stats and inventory in one go. set_stat adds a stat or changes its value, range, description or name.",
      parameters: objectSchema(
        {
          ...taleIdProperty,
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: [
                    "set_stat",
                    "remove_stat",
                    "add_item",
                    "update_item",
                    "remove_item",
                  ],
                },
                name: {
                  type: "string",
                  description: "The stat's name, or the item's name.",
                },
                newName: {
                  type: "string",
                  description: "set_stat: rename the stat.",
                },
                value: { type: "number" },
                min: { type: "number" },
                max: { type: "number" },
                id: {
                  type: "string",
                  description:
                    "The item's id, for update_item and remove_item.",
                },
                description: { type: "string" },
              },
              required: ["op"],
            },
          },
        },
        ["ops"],
      ),
      run: async (args, signal) => {
        const list = ops(args);
        const added: Array<{ id: string; name: string }> = [];
        const changes = await setup(args, signal, (tale) => {
          if (tale.tale.gameMode !== GameMode.GM)
            throw new Error(
              "Stats and inventory are only used in Game Master mode. Switch the mode with update_tale first if the player wants that.",
            );
          for (const op of list) {
            if (op.op === "set_stat") setStatFrom(tale, op);
            else if (op.op === "remove_stat")
              tale.removeStat(required(op, "name"));
            else if (op.op === "add_item") {
              const item = addItemFrom(tale, op);
              added.push({ id: item.id, name: item.name });
            } else if (op.op === "update_item") updateItemFrom(tale, op);
            else if (op.op === "remove_item")
              tale.removeItem(required(op, "id"));
            else
              throw new Error(
                "op must be set_stat, remove_stat, add_item, update_item or remove_item.",
              );
          }
        });
        return { ...describeChanges(changes), added };
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
                op: { type: "string", enum: ["edit", "insert", "delete"] },
                id: {
                  type: "string",
                  description: "edit: the passage to rewrite.",
                },
                text: { type: "string", description: "edit: the new text." },
                after: {
                  type: "string",
                  description:
                    'insert: the passage id to add after, or "start".',
                },
                passages: {
                  type: "array",
                  description: "insert: the passages to add, in order.",
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
                  description: "delete: the passages to remove.",
                },
              },
              required: ["op"],
            },
          },
        },
        ["ops"],
      ),
      run: async (args, signal) => {
        const list = ops(args);
        const taleId = taleIdFor(args, context);
        const inserted: string[] = [];
        let changed = 0;
        await withTaleWrites(signal, async () => {
          for (const op of list) {
            if (op.op === "edit") {
              const textValue = optionalString(op.text);
              if (!textValue?.trim()) throw new Error("edit needs text.");
              changed += record([
                await rewritePassage(taleId, required(op, "id"), textValue),
              ]).length;
            } else if (op.op === "insert") {
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
                throw new Error("insert needs passages with text.");
              const entries = passages.map(toLogEntry);
              changed += record([
                await insertPassages(
                  taleId,
                  after === "start" ? null : after,
                  entries,
                ),
              ]).length;
              inserted.push(...entries.map((entry) => entry.id));
            } else if (op.op === "delete") {
              const ids = strings(op.ids) ?? [];
              if (!ids.length) throw new Error("delete needs ids.");
              changed += record(await deletePassages(taleId, ids)).length;
            } else throw new Error("op must be edit, insert or delete.");
          }
        });
        return { changed, ...(inserted.length ? { inserted } : {}) };
      },
    }),
  ];
}
