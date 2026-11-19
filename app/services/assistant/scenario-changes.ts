import { nanoid } from "nanoid";
import {
  normalizeStoryCard,
  normalizeStorybookCategory,
} from "@/lib/story-card-utils";
import {
  GameMode,
  PromptComponentType,
  type InventoryItemContent,
  type PromptComponentContent,
  type ScenarioContent,
  type StatContent,
  type StoryCardContent,
} from "@/types/context.type";
import type { ScenarioRecord } from "@/types/assistant.type";
import { same } from "./tale-changes";

export class ScenarioEdits {
  constructor(public record: ScenarioRecord) {}

  private setContent(content: ScenarioContent[]) {
    this.record = { ...this.record, content };
  }

  private find<T extends ScenarioContent["type"]>(type: T, id: string) {
    const item = this.record.content.find(
      (entry) => entry.type === type && entry.id === id,
    );
    if (!item)
      throw new Error(
        `No ${type === "story_card" ? "story card" : "inventory item"} has id ${id}.`,
      );
    return item as Extract<ScenarioContent, { type: T }>;
  }

  private replace(id: string, next: ScenarioContent | null) {
    this.setContent(
      next
        ? this.record.content.map((item) => (item.id === id ? next : item))
        : this.record.content.filter((item) => item.id !== id),
    );
  }

  setName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name cannot be empty.");
    this.record = { ...this.record, name: trimmed };
  }

  setDescription(description: string) {
    this.record = { ...this.record, description };
  }

  setMode(mode: GameMode) {
    this.record = { ...this.record, initialGameMode: mode };
  }

  setComponent(promptType: PromptComponentType, content: string) {
    const current = this.record.content.find(
      (item): item is PromptComponentContent =>
        item.type === "prompt_component" && item.promptType === promptType,
    );
    if (!content.trim()) {
      if (current) this.replace(current.id, null);
      return;
    }
    if (current) this.replace(current.id, { ...current, content });
    else
      this.setContent([
        ...this.record.content,
        {
          type: "prompt_component",
          version: 1,
          id: nanoid(12),
          promptType,
          content,
        },
      ]);
  }

  addCard(input: {
    title: string;
    content: string;
    category?: string;
    triggers?: string[];
    pinned?: boolean;
  }): StoryCardContent {
    const card = toCardContent({
      id: nanoid(12),
      title: input.title,
      content: input.content,
      category: input.category,
      triggers: input.triggers ?? [],
      isPinned: input.pinned ?? false,
    });
    this.setContent([...this.record.content, card]);
    return card;
  }

  updateCard(
    id: string,
    patch: Partial<
      Pick<
        StoryCardContent,
        "title" | "content" | "triggers" | "category" | "isPinned"
      >
    >,
  ) {
    const card = this.find("story_card", id);
    this.replace(id, toCardContent({ ...card, ...patch }));
  }

  removeCard(id: string) {
    this.find("story_card", id);
    this.replace(id, null);
  }

  setStat(input: {
    name: string;
    newName?: string;
    value?: number;
    min?: number;
    max?: number;
    description?: string;
  }) {
    const stats = this.record.content.filter(
      (item): item is StatContent => item.type === "stat",
    );
    const before = stats.find((stat) => stat.name === input.name);
    const min = input.min ?? before?.range[0] ?? 0;
    const max =
      input.max ?? before?.range[1] ?? Math.max(100, input.value ?? 0);
    if (min > max) throw new Error("min must not be above max.");
    const name = input.newName?.trim() || input.name.trim();
    if (!name) throw new Error("A stat needs a name.");
    if (name !== before?.name && stats.some((stat) => stat.name === name))
      throw new Error(`A stat is already named ${name}.`);
    const description = input.description ?? before?.description;
    const stat: StatContent = {
      type: "stat",
      version: 1,
      id: before?.id ?? nanoid(12),
      name,
      value: Math.min(max, Math.max(min, input.value ?? before?.value ?? min)),
      range: [min, max],
      ...(description?.trim() ? { description: description.trim() } : {}),
    };
    if (before) this.replace(before.id, stat);
    else this.setContent([...this.record.content, stat]);
  }

  removeStat(name: string) {
    const stat = this.record.content.find(
      (item) => item.type === "stat" && item.name === name,
    );
    if (!stat) throw new Error(`No stat is named ${name}.`);
    this.replace(stat.id, null);
  }

  addItem(name: string, description?: string): InventoryItemContent {
    if (!name.trim()) throw new Error("An item needs a name.");
    const item: InventoryItemContent = {
      type: "inventory_item",
      version: 1,
      id: nanoid(12),
      name: name.trim(),
      ...(description?.trim() ? { description: description.trim() } : {}),
    };
    this.setContent([...this.record.content, item]);
    return item;
  }

  updateItem(id: string, patch: { name?: string; description?: string }) {
    const item = this.find("inventory_item", id);
    const description = patch.description ?? item.description;
    this.replace(id, {
      type: "inventory_item",
      version: 1,
      id,
      name: patch.name?.trim() || item.name,
      ...(description?.trim() ? { description: description.trim() } : {}),
    });
  }

  removeItem(id: string) {
    this.find("inventory_item", id);
    this.replace(id, null);
  }
}

function toCardContent(card: {
  id: string;
  title: string;
  content: string;
  category?: string;
  triggers: string[];
  isPinned: boolean;
}): StoryCardContent {
  const normalized = normalizeStoryCard({
    ...card,
    title: card.title.trim(),
    triggers: [...new Set(card.triggers.map((t) => t.trim()).filter(Boolean))],
    category: normalizeStorybookCategory(card.category),
  });
  return {
    type: "story_card",
    version: 1,
    id: normalized.id,
    title: normalized.title,
    triggers: normalized.triggers,
    content: normalized.content,
    category: normalized.category,
    isPinned: normalized.isPinned,
  };
}

type Part = { value: unknown; item?: ScenarioContent };

const partKey = (item: ScenarioContent) =>
  item.type === "prompt_component"
    ? `prompt:${item.promptType}`
    : `${item.type}:${item.id}`;

function parts(record: ScenarioRecord): Map<string, Part> {
  const map = new Map<string, Part>([
    ["name", { value: record.name }],
    ["description", { value: record.description }],
    ["mode", { value: record.initialGameMode }],
  ]);
  for (const item of record.content) {
    if (item.type === "prompt_component") {
      if (item.content.trim())
        map.set(partKey(item), { value: item.content, item });
    } else {
      const { version: _version, ...value } = item;
      map.set(partKey(item), { value, item });
    }
  }
  return map;
}

export function changedParts(before: ScenarioRecord, after: ScenarioRecord) {
  const a = parts(before);
  const b = parts(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter(
    (key) => !same(a.get(key)?.value, b.get(key)?.value),
  );
}

/**
 * Puts back what one step changed, part by part, where the scenario still shows what Hakawati wrote.
 * Parts changed since are left alone and counted as kept.
 */
export function revertScenario(
  current: ScenarioRecord,
  before: ScenarioRecord,
  after: ScenarioRecord,
): { next: ScenarioRecord; reverted: number; kept: number } {
  const was = parts(before);
  const wrote = parts(after);
  const now = parts(current);
  let next = { ...current, content: [...current.content] };
  let reverted = 0;
  let kept = 0;
  for (const key of changedParts(before, after)) {
    if (!same(now.get(key)?.value, wrote.get(key)?.value)) {
      kept += 1;
      continue;
    }
    reverted += 1;
    const old = was.get(key);
    if (key === "name" || key === "description") {
      next = { ...next, [key]: old?.value as string };
      continue;
    }
    if (key === "mode") {
      next = { ...next, initialGameMode: old?.value as GameMode };
      continue;
    }
    const index = next.content.findIndex((item) => partKey(item) === key);
    if (old?.item && index >= 0)
      next.content = next.content.map((item, i) =>
        i === index ? old.item! : item,
      );
    else if (old?.item) next.content = [...next.content, old.item];
    else if (index >= 0)
      next.content = next.content.filter((_, i) => i !== index);
  }
  return { next, reverted, kept };
}
