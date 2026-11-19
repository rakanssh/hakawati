import { nanoid } from "nanoid";
import {
  createPromptComponent,
  normalizePromptComponents,
} from "@/lib/prompt-components";
import {
  normalizeStoryCard,
  normalizeStorybookCategory,
} from "@/lib/story-card-utils";
import type { TaleMutableSnapshot } from "@/services/tale.service";
import {
  GameMode,
  PromptComponentType,
  type Item,
  type StoryCard,
} from "@/types";
import type { TaleChange, TaleField } from "@/types/assistant.type";
import type { Stat } from "@/types/stats.type";

export type TaleSnapshot = TaleMutableSnapshot;

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

const cardBody = (card: StoryCard | null | undefined) => {
  if (!card) return null;
  const { createdAt: _created, updatedAt: _updated, ...body } = card;
  return body;
};

const sameCard = (a: StoryCard | null | undefined, b: StoryCard | null) =>
  same(cardBody(a), cardBody(b));

export class TaleEditError extends Error {}

/** Collects one tool call's edits to a tale, recording a change for each. */
export class TaleChanges {
  readonly changes: TaleChange[] = [];

  constructor(
    readonly taleId: string,
    public tale: TaleSnapshot,
  ) {}

  private record(change: TaleChange) {
    this.changes.push(change);
  }

  setField(field: TaleField, value: string) {
    const before = String(this.tale[field]);
    if (before === value) return;
    if (
      field === "gameMode" &&
      value !== GameMode.GM &&
      value !== GameMode.STORY_TELLER
    )
      throw new TaleEditError("mode must be story_teller or game_master.");
    this.tale = { ...this.tale, [field]: value };
    this.record({
      taleId: this.taleId,
      kind: "field",
      field,
      before,
      after: value,
    });
  }

  setComponent(type: PromptComponentType, content: string | null) {
    const current = this.tale.components.find((c) => c.type === type);
    const before = current?.content ?? null;
    const after = content?.trim() ? content : null;
    if (before === after) return;
    const others = this.tale.components.filter((c) => c.type !== type);
    const next =
      after === null
        ? others
        : [
            ...others,
            current
              ? { ...current, content: after, updatedAt: Date.now() }
              : createPromptComponent(type, after),
          ];
    this.tale = { ...this.tale, components: normalizePromptComponents(next) };
    this.record({
      taleId: this.taleId,
      kind: "component",
      type,
      before,
      after,
    });
  }

  addCard(input: {
    title: string;
    content: string;
    category?: string;
    triggers?: string[];
    pinned?: boolean;
  }): StoryCard {
    const card = normalizeStoryCard({
      id: nanoid(12),
      title: input.title,
      content: input.content,
      category: normalizeStorybookCategory(input.category),
      triggers: input.triggers ?? [],
      isPinned: input.pinned ?? false,
    });
    this.tale = { ...this.tale, storyCards: [...this.tale.storyCards, card] };
    this.record({
      taleId: this.taleId,
      kind: "card",
      id: card.id,
      before: null,
      after: card,
    });
    return card;
  }

  updateCard(
    id: string,
    patch: Partial<
      Pick<
        StoryCard,
        "title" | "content" | "triggers" | "category" | "isPinned"
      >
    >,
  ) {
    const before = this.tale.storyCards.find((card) => card.id === id);
    if (!before) throw new TaleEditError(`No story card has id ${id}.`);
    const after = normalizeStoryCard({
      ...before,
      ...patch,
      updatedAt: Date.now(),
    });
    if (sameCard(before, after)) return;
    this.tale = {
      ...this.tale,
      storyCards: this.tale.storyCards.map((card) =>
        card.id === id ? after : card,
      ),
    };
    this.record({ taleId: this.taleId, kind: "card", id, before, after });
  }

  removeCard(id: string) {
    const before = this.tale.storyCards.find((card) => card.id === id);
    if (!before) throw new TaleEditError(`No story card has id ${id}.`);
    this.tale = {
      ...this.tale,
      storyCards: this.tale.storyCards.filter((card) => card.id !== id),
    };
    this.record({ taleId: this.taleId, kind: "card", id, before, after: null });
  }

  setStat(input: {
    name: string;
    newName?: string;
    value?: number;
    min?: number;
    max?: number;
    description?: string;
  }) {
    const before =
      this.tale.stats.find((stat) => stat.name === input.name) ?? null;
    if (!before && input.value === undefined)
      throw new TaleEditError(
        `No stat is named ${input.name}; give a value to add it.`,
      );
    const min = input.min ?? before?.range[0] ?? 0;
    const max =
      input.max ?? before?.range[1] ?? Math.max(100, input.value ?? 0);
    if (min > max) throw new TaleEditError("min must not be above max.");
    const name = input.newName?.trim() || input.name;
    if (
      name !== input.name &&
      this.tale.stats.some((stat) => stat.name === name)
    )
      throw new TaleEditError(`A stat is already named ${name}.`);
    const description = input.description ?? before?.description;
    const after: Stat = {
      name,
      value: Math.min(max, Math.max(min, input.value ?? before?.value ?? min)),
      range: [min, max],
      ...(description ? { description } : {}),
    };
    if (same(before, after)) return;
    this.tale = {
      ...this.tale,
      stats: before
        ? this.tale.stats.map((stat) =>
            stat.name === input.name ? after : stat,
          )
        : [...this.tale.stats, after],
    };
    this.record({ taleId: this.taleId, kind: "stat", before, after });
  }

  removeStat(name: string) {
    const before = this.tale.stats.find((stat) => stat.name === name);
    if (!before) throw new TaleEditError(`No stat is named ${name}.`);
    this.tale = {
      ...this.tale,
      stats: this.tale.stats.filter((stat) => stat.name !== name),
    };
    this.record({ taleId: this.taleId, kind: "stat", before, after: null });
  }

  addItem(name: string, description?: string): Item {
    const item: Item = {
      id: nanoid(12),
      name,
      ...(description ? { description } : {}),
    };
    this.tale = { ...this.tale, inventory: [...this.tale.inventory, item] };
    this.record({
      taleId: this.taleId,
      kind: "item",
      id: item.id,
      before: null,
      after: item,
    });
    return item;
  }

  updateItem(id: string, patch: { name?: string; description?: string }) {
    const before = this.tale.inventory.find((item) => item.id === id);
    if (!before) throw new TaleEditError(`No item has id ${id}.`);
    const description = patch.description ?? before.description;
    const after: Item = {
      id,
      name: patch.name ?? before.name,
      ...(description ? { description } : {}),
    };
    if (same(before, after)) return;
    this.tale = {
      ...this.tale,
      inventory: this.tale.inventory.map((item) =>
        item.id === id ? after : item,
      ),
    };
    this.record({ taleId: this.taleId, kind: "item", id, before, after });
  }

  removeItem(id: string) {
    const before = this.tale.inventory.find((item) => item.id === id);
    if (!before) throw new TaleEditError(`No item has id ${id}.`);
    this.tale = {
      ...this.tale,
      inventory: this.tale.inventory.filter((item) => item.id !== id),
    };
    this.record({ taleId: this.taleId, kind: "item", id, before, after: null });
  }
}

const STATE_KINDS = new Set(["field", "component", "card", "stat", "item"]);

export const isStateChange = (change: TaleChange) =>
  STATE_KINDS.has(change.kind);

/**
 * Puts one setup change back if the tale still shows what Hakawati wrote.
 * Returns the tale after the undo, or null when it was changed since and is left alone.
 */
export function revertStateChange(
  tale: TaleSnapshot,
  change: TaleChange,
): TaleSnapshot | null {
  switch (change.kind) {
    case "field":
      return String(tale[change.field]) === change.after
        ? { ...tale, [change.field]: change.before }
        : null;
    case "component": {
      const current = tale.components.find((c) => c.type === change.type);
      if ((current?.content ?? null) !== change.after) return null;
      const others = tale.components.filter((c) => c.type !== change.type);
      return {
        ...tale,
        components: normalizePromptComponents(
          change.before === null
            ? others
            : [
                ...others,
                current
                  ? {
                      ...current,
                      content: change.before,
                      updatedAt: Date.now(),
                    }
                  : createPromptComponent(change.type, change.before),
              ],
        ),
      };
    }
    case "card": {
      const current =
        tale.storyCards.find((card) => card.id === change.id) ?? null;
      if (!sameCard(current, change.after)) return null;
      const rest = tale.storyCards.filter((card) => card.id !== change.id);
      if (!change.before) return { ...tale, storyCards: rest };
      const restored = change.before;
      return {
        ...tale,
        storyCards: current
          ? tale.storyCards.map((card) =>
              card.id === change.id ? restored : card,
            )
          : [...rest, restored],
      };
    }
    case "stat": {
      const name = change.after?.name ?? change.before?.name;
      const current = tale.stats.find((stat) => stat.name === name) ?? null;
      if (!same(current, change.after)) return null;
      if (
        change.before &&
        change.before.name !== change.after?.name &&
        tale.stats.some((stat) => stat.name === change.before!.name)
      )
        return null;
      const rest = tale.stats.filter((stat) => stat.name !== name);
      if (!change.before) return { ...tale, stats: rest };
      const restored = change.before;
      return {
        ...tale,
        stats: current
          ? tale.stats.map((stat) => (stat.name === name ? restored : stat))
          : [...rest, restored],
      };
    }
    case "item": {
      const current =
        tale.inventory.find((item) => item.id === change.id) ?? null;
      if (!same(current, change.after)) return null;
      const rest = tale.inventory.filter((item) => item.id !== change.id);
      if (!change.before) return { ...tale, inventory: rest };
      const restored = change.before;
      return {
        ...tale,
        inventory: current
          ? tale.inventory.map((item) =>
              item.id === change.id ? restored : item,
            )
          : [...rest, restored],
      };
    }
    default:
      return null;
  }
}
