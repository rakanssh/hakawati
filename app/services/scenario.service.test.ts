import { describe, expect, it } from "vitest";
import {
  deserializeScenarioExport,
  serializeScenarioExportV2,
} from "./scenario.service";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
} from "@/types/context.type";

describe("scenario service exports", () => {
  it("maps v1 scenario imports into user description and prompt components", () => {
    const scenario = deserializeScenarioExport(
      JSON.stringify({
        type: "hakawati.scenario",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          name: "Old Forest",
          initialGameMode: GameMode.STORY_TELLER,
          initialDescription: "A haunted forest waits.",
          initialAuthorNote: "Keep it eerie.",
          initialStats: [{ name: "HP", value: 10, range: [0, 20] }],
          initialInventory: ["Lantern"],
          initialStoryCards: [
            {
              id: "card-1",
              title: "Forest",
              triggers: ["forest"],
              content: "The forest watches.",
            },
          ],
          openingText: "Branches scrape the moon.",
        },
      }),
    );

    expect(scenario.description).toBe("A haunted forest waits.");
    expect(scenario.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "prompt_component",
          promptType: PromptComponentType.PLOT,
          content: "A haunted forest waits.",
        }),
        expect.objectContaining({
          type: "prompt_component",
          promptType: PromptComponentType.AUTHOR_NOTE,
          content: "Keep it eerie.",
        }),
        expect.objectContaining({
          type: "prompt_component",
          promptType: PromptComponentType.OPENING,
          content: "Branches scrape the moon.",
        }),
      ]),
    );
    expect(scenario.content.find((item) => item.type === "stat")).toMatchObject(
      { range: [0, 20] },
    );
    expect(
      scenario.content.find((item) => item.type === "story_card"),
    ).toMatchObject({
      category: StorybookCategory.UNCATEGORIZED,
    });
  });

  it("maps v2 scenario imports into canonical content", () => {
    const scenario = deserializeScenarioExport(
      JSON.stringify({
        type: "hakawati.scenario",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: {
          id: "scenario-2",
          name: "Old Split Forest",
          initialGameMode: GameMode.STORY_TELLER,
          description: "A split scenario.",
          components: [
            {
              id: "plot-1",
              type: PromptComponentType.PLOT,
              content: "The forest is old.",
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          initialStats: [{ name: "HP", value: 10, range: [0, 20] }],
          initialInventory: ["Lantern"],
          initialStoryCards: [
            {
              id: "card-1",
              title: "Forest",
              triggers: ["forest"],
              content: "The forest watches.",
              category: StorybookCategory.UNCATEGORIZED,
            },
          ],
        },
      }),
    );

    expect(scenario.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "prompt_component",
          promptType: PromptComponentType.PLOT,
        }),
        expect.objectContaining({ type: "stat", name: "HP" }),
        expect.objectContaining({ type: "inventory_item", name: "Lantern" }),
      ]),
    );
  });

  it("serializes scenarios as v3 with content", () => {
    const json = serializeScenarioExportV2({
      id: "scenario-1",
      name: "New Forest",
      initialGameMode: GameMode.STORY_TELLER,
      description: "A forest scenario.",
      content: [
        {
          type: "prompt_component",
          version: 1,
          id: "plot-1",
          promptType: PromptComponentType.PLOT,
          content: "The forest is old.",
        },
      ],
      thumbnail: null,
    });

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
    expect(parsed.data.description).toBe("A forest scenario.");
    expect(parsed.data.content[0].promptType).toBe(PromptComponentType.PLOT);
    expect(parsed.data.thumbnail).toBeUndefined();
  });

  it("round-trips v3 scenario exports", () => {
    const json = serializeScenarioExportV2({
      id: "scenario-1",
      name: "New Forest",
      initialGameMode: GameMode.STORY_TELLER,
      description: "A forest scenario.",
      content: [
        {
          type: "story_card",
          version: 1,
          id: "card-1",
          title: "Forest",
          triggers: ["forest", " forest "],
          content: "The forest watches.",
          category: StorybookCategory.UNCATEGORIZED,
          isPinned: false,
        },
      ],
      thumbnail: null,
    });

    const scenario = deserializeScenarioExport(json);
    expect(scenario.content[0]).toMatchObject({
      type: "story_card",
      triggers: ["forest"],
      category: StorybookCategory.UNCATEGORIZED,
    });
  });
});
