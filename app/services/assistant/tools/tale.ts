import {
  GameMode,
  LogEntryMode,
  PromptComponentType,
  StorybookCategory,
} from "@/types";
import type { AssistantChange } from "@/types/assistant.type";
import { TaleEditError, type TaleChanges } from "../tale-changes";
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
  objectSchema,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { taleIdFor, taleIdProperty } from "./read";

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function ops(args: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(args.ops) || args.ops.length === 0)
    throw new TaleEditError("ops must list at least one change.");
  return args.ops.map((op) => {
    if (!op || typeof op !== "object" || Array.isArray(op))
      throw new TaleEditError("Each op must be an object.");
    return op as Record<string, unknown>;
  });
}

function required(op: Record<string, unknown>, key: string): string {
  const value = text(op[key]);
  if (!value) throw new TaleEditError(`${String(op.op)} needs ${key}.`);
  return value;
}

const describeChanges = (changes: AssistantChange[]) => ({
  changed: changes.length,
});

const CATEGORIES = Object.values(StorybookCategory);

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
        mode: { type: "string", enum: ["story_teller", "game_master"] },
      }),
      run: async (args, signal) => {
        const name = optionalString(args.name);
        if (name !== undefined && !name.trim())
          throw new TaleEditError("name cannot be empty.");
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
            tale.setField(
              "gameMode",
              args.mode === "game_master" ? GameMode.GM : GameMode.STORY_TELLER,
            );
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
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["add", "update", "remove"] },
                id: {
                  type: "string",
                  description: "The card's id, for update and remove.",
                },
                title: { type: "string" },
                content: { type: "string" },
                category: { type: "string", enum: CATEGORIES },
                triggers: { type: "array", items: { type: "string" } },
                pinned: { type: "boolean" },
              },
              required: ["op"],
            },
          },
        },
        ["ops"],
      ),
      run: async (args, signal) => {
        const list = ops(args);
        const added: Array<{ id: string; title: string }> = [];
        const changes = await setup(args, signal, (tale) => {
          for (const op of list) {
            const triggers = Array.isArray(op.triggers)
              ? op.triggers.filter((t): t is string => typeof t === "string")
              : undefined;
            if (op.op === "add") {
              const card = tale.addCard({
                title: required(op, "title"),
                content: optionalString(op.content) ?? "",
                category: optionalString(op.category),
                triggers,
                pinned: op.pinned === true,
              });
              added.push({ id: card.id, title: card.title });
            } else if (op.op === "update") {
              tale.updateCard(required(op, "id"), {
                ...(text(op.title) ? { title: text(op.title) } : {}),
                ...(optionalString(op.content) !== undefined
                  ? { content: optionalString(op.content) }
                  : {}),
                ...(optionalString(op.category)
                  ? { category: op.category as StorybookCategory }
                  : {}),
                ...(triggers ? { triggers } : {}),
                ...(typeof op.pinned === "boolean"
                  ? { isPinned: op.pinned }
                  : {}),
              });
            } else if (op.op === "remove") {
              tale.removeCard(required(op, "id"));
            } else throw new TaleEditError("op must be add, update or remove.");
          }
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
            throw new TaleEditError(
              "Stats and inventory are only used in Game Master mode. Switch the mode with update_tale first if the player wants that.",
            );
          for (const op of list) {
            if (op.op === "set_stat") {
              tale.setStat({
                name: required(op, "name"),
                newName: text(op.newName),
                value: optionalNumber(op.value),
                min: optionalNumber(op.min),
                max: optionalNumber(op.max),
                description: optionalString(op.description),
              });
            } else if (op.op === "remove_stat") {
              tale.removeStat(required(op, "name"));
            } else if (op.op === "add_item") {
              const item = tale.addItem(
                required(op, "name"),
                text(op.description),
              );
              added.push({ id: item.id, name: item.name });
            } else if (op.op === "update_item") {
              tale.updateItem(required(op, "id"), {
                name: text(op.name),
                description: optionalString(op.description),
              });
            } else if (op.op === "remove_item") {
              tale.removeItem(required(op, "id"));
            } else
              throw new TaleEditError(
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
      detail: (args) =>
        Array.isArray(args.ops) ? String(args.ops.length) : undefined,
      run: async (args, signal) => {
        const list = ops(args);
        const taleId = taleIdFor(args, context);
        const inserted: string[] = [];
        let changed = 0;
        await withTaleWrites(signal, async () => {
          for (const op of list) {
            if (op.op === "edit") {
              const textValue = optionalString(op.text);
              if (!textValue?.trim())
                throw new TaleEditError("edit needs text.");
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
                throw new TaleEditError("insert needs passages with text.");
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
              const ids = Array.isArray(op.ids)
                ? op.ids.filter((id): id is string => typeof id === "string")
                : [];
              if (!ids.length) throw new TaleEditError("delete needs ids.");
              changed += record(await deletePassages(taleId, ids)).length;
            } else
              throw new TaleEditError("op must be edit, insert or delete.");
          }
        });
        return { changed, ...(inserted.length ? { inserted } : {}) };
      },
    }),
  ];
}
