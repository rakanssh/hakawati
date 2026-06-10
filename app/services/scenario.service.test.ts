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
    expect(scenario.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: PromptComponentType.PLOT,
          content: "A haunted forest waits.",
        }),
        expect.objectContaining({
          type: PromptComponentType.AUTHOR_NOTE,
          content: "Keep it eerie.",
        }),
        expect.objectContaining({
          type: PromptComponentType.OPENING,
          content: "Branches scrape the moon.",
        }),
      ]),
    );
    expect(scenario.initialStats[0].range).toEqual([0, 20]);
    expect(scenario.initialStoryCards[0].category).toBe(
      StorybookCategory.UNCATEGORIZED,
    );
  });

  it("serializes scenarios as v2 with components", () => {
    const json = serializeScenarioExportV2({
      id: "scenario-1",
      name: "New Forest",
      initialGameMode: GameMode.STORY_TELLER,
      description: "A forest scenario.",
      components: [
        {
          id: "plot-1",
          type: PromptComponentType.PLOT,
          content: "The forest is old.",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      initialStats: [],
      initialInventory: [],
      initialStoryCards: [],
      thumbnail: null,
    });

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.data.description).toBe("A forest scenario.");
    expect(parsed.data.components[0].type).toBe(PromptComponentType.PLOT);
    expect(parsed.data.thumbnail).toBeUndefined();
  });
});
