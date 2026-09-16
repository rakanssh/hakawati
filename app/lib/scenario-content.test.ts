import { describe, expect, it } from "vitest";
import {
  normalizeScenarioContent,
  legacyScenarioToContent,
  scenarioContentToEditorFields,
  scenarioContentToPackage,
  scenarioContentToTaleSeed,
  editorFieldsToScenarioContent,
} from "./scenario-content";
import { PromptComponentType, StorybookCategory } from "@/types/context.type";

describe("scenario content", () => {
  it("converts legacy fields into deterministic canonical content", () => {
    const first = legacyScenarioToContent({
      description: "A gate waits.",
      initialStats: [{ name: "Nerve", value: 5, range: [0, 10] }],
      initialInventory: ["Iron key"],
      initialStoryCards: [
        {
          id: "gatekeeper",
          title: "Gatekeeper",
          triggers: ["gatekeeper", " gatekeeper "],
          content: "The gatekeeper remembers every opening.",
          category: StorybookCategory.CHARACTER,
          isPinned: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const second = legacyScenarioToContent({
      description: "A gate waits.",
      initialStats: [{ name: "Nerve", value: 5, range: [0, 10] }],
      initialInventory: ["Iron key"],
    });

    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "stat",
          id: "stat-nerve-1",
          name: "Nerve",
        }),
        expect.objectContaining({
          type: "inventory_item",
          id: "inventory_item-iron-key-1",
          name: "Iron key",
        }),
        expect.objectContaining({
          type: "story_card",
          triggers: ["gatekeeper"],
        }),
      ]),
    );
    expect(first.find((item) => item.type === "stat")?.id).toBe(
      second.find((item) => item.type === "stat")?.id,
    );
  });

  it("materializes canonical content into tale seed fields", () => {
    const seed = scenarioContentToTaleSeed([
      {
        type: "prompt_component",
        version: 1,
        id: "plot",
        promptType: PromptComponentType.PLOT,
        content: "The central premise.",
      },
      {
        type: "prompt_component",
        version: 1,
        id: "opening",
        promptType: PromptComponentType.OPENING,
        content: "Rain needles the gate.",
      },
      {
        type: "inventory_item",
        version: 1,
        id: "iron-key",
        name: "Iron key",
        description: "Cold to the touch.",
      },
    ]);

    expect(seed.openingText).toBe("Rain needles the gate.");
    expect(seed.components).toEqual([
      expect.objectContaining({ type: PromptComponentType.PLOT }),
    ]);
    expect(seed.inventory).toEqual([
      { id: "iron-key", name: "Iron key", description: "Cold to the touch." },
    ]);
  });

  it("projects content for existing editor controls and trims package content", () => {
    const content = legacyScenarioToContent({
      components: [
        {
          id: "empty-author-note",
          type: PromptComponentType.AUTHOR_NOTE,
          content: " ",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      initialInventory: [" Compass "],
    });

    expect(scenarioContentToEditorFields(content).initialInventory).toEqual([
      expect.objectContaining({ name: "Compass" }),
    ]);
    expect(scenarioContentToPackage(content)).toEqual([
      expect.objectContaining({
        type: "inventory_item",
        name: "Compass",
      }),
    ]);
  });

  it("preserves ids, inventory descriptions and unfinished question text through editing", () => {
    const fields = scenarioContentToEditorFields([
      {
        type: "stat",
        version: 1,
        id: "stable-stat",
        name: "Nerve",
        description: "${Who are you?}",
        value: 5,
        range: [0, 10],
      },
      {
        type: "inventory_item",
        version: 1,
        id: "stable-item",
        name: "Sword",
        description: "Belongs to ${Who are you?}",
      },
    ]);
    fields.initialStats[0].name = "${Which trait ";
    fields.initialInventory[0].name = "${Which item ";
    const edited = editorFieldsToScenarioContent(fields);
    const reopened = scenarioContentToEditorFields(edited);
    expect(reopened.initialStats[0]).toMatchObject({
      id: "stable-stat",
      name: "${Which trait ",
      description: "${Who are you?}",
    });
    expect(reopened.initialInventory[0]).toEqual({
      id: "stable-item",
      name: "${Which item ",
      description: "Belongs to ${Who are you?}",
    });
  });

  it("preserves prompt component whitespace while editing", () => {
    const content = normalizeScenarioContent([
      {
        type: "prompt_component",
        version: 1,
        id: "plot",
        promptType: PromptComponentType.PLOT,
        content: "first ",
      },
    ]);

    expect(scenarioContentToEditorFields(content).components[0].content).toBe(
      "first ",
    );
    expect(scenarioContentToPackage(content)).toEqual([
      expect.objectContaining({
        type: "prompt_component",
        content: "first",
      }),
    ]);
  });
});
