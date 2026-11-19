import { describe, expect, it } from "vitest";
import { GameMode, PromptComponentType, StorybookCategory } from "@/types";
import {
  revertStateChange,
  TaleChanges,
  TaleEditError,
  type TaleSnapshot,
} from "./tale-changes";

const tale = (): TaleSnapshot => ({
  name: "Signal",
  description: "A station at sea.",
  components: [
    {
      id: "plot",
      type: PromptComponentType.PLOT,
      content: "Alone at sea.",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  storyCards: [
    {
      id: "mara",
      title: "Mara",
      triggers: ["Mara"],
      content: "A smuggler.",
      category: StorybookCategory.CHARACTER,
      isPinned: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  stats: [{ name: "HP", value: 7, range: [0, 10] }],
  inventory: [{ id: "lamp", name: "Lamp" }],
  gameMode: GameMode.GM,
  undoStack: [],
});

function undoAll(edits: TaleChanges) {
  let current: TaleSnapshot | null = edits.tale;
  for (const change of [...edits.changes].reverse()) {
    current = revertStateChange(current!, change);
    expect(current).not.toBeNull();
  }
  return current!;
}

describe("Hakawati's tale changes", () => {
  it("records each edit and undoes them all back to the start", () => {
    const start = tale();
    const edits = new TaleChanges("t", start);
    edits.setField("name", "Signal from the Deep");
    edits.setComponent(PromptComponentType.PLOT, "A ghost ship returns.");
    edits.setComponent(PromptComponentType.AUTHOR_NOTE, "Keep it eerie.");
    edits.updateCard("mara", { content: "A smuggler who lies." });
    const card = edits.addCard({ title: "Meridian", content: "A lost ship." });
    edits.removeCard("mara");
    edits.setStat({ name: "HP", value: 5 });
    edits.setStat({ name: "Dread", value: 2, max: 5 });
    edits.setStat({ name: "HP", newName: "Health" });
    const item = edits.addItem("Flare");
    edits.updateItem("lamp", { name: "Brass lamp" });
    edits.removeItem(item.id);

    expect(edits.changes.map((c) => c.kind)).toEqual([
      "field",
      "component",
      "component",
      "card",
      "card",
      "card",
      "stat",
      "stat",
      "stat",
      "item",
      "item",
      "item",
    ]);
    expect(edits.tale.storyCards.map((c) => c.id)).toEqual([card.id]);
    expect(edits.tale.stats).toEqual([
      { name: "Health", value: 5, range: [0, 10] },
      { name: "Dread", value: 2, range: [0, 5] },
    ]);

    const undone = undoAll(edits);
    expect(undone.name).toBe(start.name);
    expect(undone.components.map((c) => [c.type, c.content])).toEqual([
      [PromptComponentType.PLOT, "Alone at sea."],
    ]);
    expect(undone.storyCards.map((c) => [c.id, c.content])).toEqual([
      ["mara", "A smuggler."],
    ]);
    expect(undone.stats).toEqual(start.stats);
    expect(undone.inventory).toEqual(start.inventory);
  });

  it("records nothing when a value doesn't change", () => {
    const edits = new TaleChanges("t", tale());
    edits.setField("name", "Signal");
    edits.setComponent(PromptComponentType.PLOT, "Alone at sea.");
    edits.updateCard("mara", { content: "A smuggler." });
    edits.setStat({ name: "HP", value: 7 });
    expect(edits.changes).toEqual([]);
  });

  it("keeps a value that was changed again since", () => {
    const edits = new TaleChanges("t", tale());
    edits.setStat({ name: "HP", value: 5 });
    edits.updateCard("mara", { content: "Changed by Hakawati." });
    const [stat, card] = edits.changes;
    const later = {
      ...edits.tale,
      stats: [{ name: "HP", value: 3, range: [0, 10] as [number, number] }],
    };
    expect(revertStateChange(later, stat)).toBeNull();
    const touched = {
      ...edits.tale,
      storyCards: edits.tale.storyCards.map((c) => ({ ...c, updatedAt: 99 })),
    };
    expect(revertStateChange(touched, card)?.storyCards[0].content).toBe(
      "A smuggler.",
    );
  });

  it("refuses edits that name things that don't exist", () => {
    const edits = new TaleChanges("t", tale());
    expect(() => edits.updateCard("ghost", { title: "x" })).toThrow(
      TaleEditError,
    );
    expect(() => edits.setStat({ name: "Luck" })).toThrow("give a value");
    expect(() => edits.setStat({ name: "HP", min: 9, max: 1 })).toThrow(
      "min must not be above max",
    );
    expect(() => edits.removeItem("ghost")).toThrow(TaleEditError);
  });

  it("clamps a stat's value to its range", () => {
    const edits = new TaleChanges("t", tale());
    edits.setStat({ name: "HP", value: 40 });
    expect(edits.tale.stats[0].value).toBe(10);
  });
});
