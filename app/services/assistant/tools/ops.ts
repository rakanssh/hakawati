import { StorybookCategory } from "@/types/context.type";
import {
  optionalNumber,
  optionalString,
  required,
  strings,
  text,
} from "./define";

type Op = Record<string, unknown>;

type CardPatch = Partial<{
  title: string;
  content: string;
  triggers: string[];
  category: StorybookCategory;
  isPinned: boolean;
}>;

/** What both tales and scenarios offer for editing story cards, stats and items. */
export interface CardTarget {
  addCard(input: {
    title: string;
    content: string;
    category?: string;
    triggers?: string[];
    pinned?: boolean;
  }): { id: string; title: string };
  updateCard(id: string, patch: CardPatch): void;
  removeCard(id: string): void;
}

export interface StatTarget {
  setStat(input: {
    name: string;
    newName?: string;
    value?: number;
    min?: number;
    max?: number;
    description?: string;
  }): void;
  removeStat(name: string): void;
}

export interface ItemTarget {
  addItem(name: string, description?: string): { id: string; name: string };
  updateItem(id: string, patch: { name?: string; description?: string }): void;
  removeItem(id: string): void;
}

export const CARD_OP_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["add", "update", "remove"] },
    id: {
      type: "string",
      description: "The card's id, for update and remove.",
    },
    title: { type: "string" },
    content: { type: "string" },
    category: { type: "string", enum: Object.values(StorybookCategory) },
    triggers: { type: "array", items: { type: "string" } },
    pinned: { type: "boolean" },
  },
  required: ["op"],
};

export function applyCardOps(target: CardTarget, ops: Op[]) {
  const added: Array<{ id: string; title: string }> = [];
  for (const op of ops) {
    const triggers = strings(op.triggers);
    if (op.op === "add") {
      const card = target.addCard({
        title: required(op, "title"),
        content: optionalString(op.content) ?? "",
        category: optionalString(op.category),
        triggers,
        pinned: op.pinned === true,
      });
      added.push({ id: card.id, title: card.title });
    } else if (op.op === "update") {
      const patch: CardPatch = {};
      const title = text(op.title);
      const content = optionalString(op.content);
      if (title) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (optionalString(op.category))
        patch.category = op.category as StorybookCategory;
      if (triggers) patch.triggers = triggers;
      if (typeof op.pinned === "boolean") patch.isPinned = op.pinned;
      target.updateCard(required(op, "id"), patch);
    } else if (op.op === "remove") target.removeCard(required(op, "id"));
    else throw new Error("A card op must be add, update or remove.");
  }
  return added;
}

export const setStatFrom = (target: StatTarget, op: Op) =>
  target.setStat({
    name: required(op, "name"),
    newName: text(op.newName),
    value: optionalNumber(op.value),
    min: optionalNumber(op.min),
    max: optionalNumber(op.max),
    description: optionalString(op.description),
  });

export const addItemFrom = (target: ItemTarget, op: Op) =>
  target.addItem(required(op, "name"), text(op.description));

export const updateItemFrom = (target: ItemTarget, op: Op) =>
  target.updateItem(required(op, "id"), {
    name: text(op.name),
    description: optionalString(op.description),
  });
