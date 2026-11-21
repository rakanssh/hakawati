import { describe, expect, it } from "vitest";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
} from "@/types/context.type";
import type { ScenarioRecord } from "@/types/assistant.type";
import {
  changedParts,
  revertScenario,
  ScenarioEdits,
} from "./scenario-changes";

const base: ScenarioRecord = {
  id: "s1",
  name: "Quiet Sea",
  description: "A radio station at sea.",
  initialGameMode: GameMode.STORY_TELLER,
  content: [
    {
      type: "prompt_component",
      version: 1,
      id: "p1",
      promptType: PromptComponentType.PLOT,
      content: "A ship returns.",
    },
    {
      type: "story_card",
      version: 1,
      id: "c1",
      title: "Mara",
      triggers: ["mara"],
      content: "The keeper.",
      category: StorybookCategory.CHARACTER,
      isPinned: false,
    },
  ],
};

describe("ScenarioEdits", () => {
  it("changes fields, components, cards, stats and items", () => {
    const edits = new ScenarioEdits(base);
    edits.setName("  Signal  ");
    edits.setMode(GameMode.GM);
    edits.setComponent(PromptComponentType.PLOT, "");
    edits.setComponent(PromptComponentType.OPENING, "The radio wakes you.");
    const card = edits.addCard({
      title: "Meridian",
      content: "A lost ship.",
      category: "Place",
      triggers: [" meridian ", "meridian"],
    });
    edits.updateCard("c1", { isPinned: true });
    edits.setStat({ name: "Nerve", value: 7, max: 10 });
    edits.setStat({ name: "Nerve", value: 12 });
    const item = edits.addItem("Lantern");
    edits.updateItem(item.id, { description: "Brass" });

    const { record } = edits;
    expect(record.name).toBe("Signal");
    expect(record.initialGameMode).toBe(GameMode.GM);
    expect(
      record.content.filter((entry) => entry.type === "prompt_component"),
    ).toEqual([
      expect.objectContaining({
        promptType: PromptComponentType.OPENING,
        content: "The radio wakes you.",
      }),
    ]);
    expect(card).toMatchObject({
      title: "Meridian",
      category: StorybookCategory.PLACE,
      triggers: ["meridian"],
    });
    expect(record.content).toContainEqual(
      expect.objectContaining({ id: "c1", isPinned: true }),
    );
    expect(record.content).toContainEqual(
      expect.objectContaining({ type: "stat", name: "Nerve", value: 10 }),
    );
    expect(record.content).toContainEqual(
      expect.objectContaining({ id: item.id, description: "Brass" }),
    );
    expect(base.name).toBe("Quiet Sea");
  });

  it("says what is missing", () => {
    const edits = new ScenarioEdits(base);
    expect(() => edits.updateCard("nope", {})).toThrow(/No story card/);
    expect(() => edits.removeStat("Nerve")).toThrow(/No stat/);
    expect(() => edits.setName(" ")).toThrow(/empty/);
  });
});

describe("revertScenario", () => {
  const edited = () => {
    const edits = new ScenarioEdits(base);
    edits.setName("Signal");
    edits.removeCard("c1");
    edits.setComponent(PromptComponentType.PLOT, "A ship never left.");
    edits.addCard({ title: "Meridian", content: "" });
    return edits.record;
  };

  it("puts back every part that still shows the edit", () => {
    const after = edited();
    expect(changedParts(base, after)).toHaveLength(4);
    const { next, reverted, kept } = revertScenario(after, base, after);
    expect({ reverted, kept }).toEqual({ reverted: 4, kept: 0 });
    expect(changedParts(next, base)).toEqual([]);
  });

  it("keeps parts changed since, and reverts the rest", () => {
    const after = edited();
    const current = new ScenarioEdits(after);
    current.setName("Signal from the Sea");
    const { next, reverted, kept } = revertScenario(
      current.record,
      base,
      after,
    );
    expect({ reverted, kept }).toEqual({ reverted: 3, kept: 1 });
    expect(next.name).toBe("Signal from the Sea");
    expect(next.content).toContainEqual(expect.objectContaining({ id: "c1" }));
    expect(
      next.content.find((entry) => entry.type === "prompt_component"),
    ).toMatchObject({ content: "A ship returns." });
  });

  it("compares prompt components by type, so a new id doesn't count as a change", () => {
    const after = edited();
    const current = {
      ...after,
      content: after.content.map((entry) =>
        entry.type === "prompt_component" ? { ...entry, id: "other" } : entry,
      ),
    };
    expect(revertScenario(current, base, after).kept).toBe(0);
  });
});
