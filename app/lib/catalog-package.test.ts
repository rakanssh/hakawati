import { describe, expect, it } from "vitest";
import {
  buildScenarioPackage,
  catalogStartSourceToTaleSource,
  parseScenarioPackage,
} from "./catalog-package";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
} from "@/types/context.type";

describe("catalog package", () => {
  it("builds hakawati-scenario-package directly from canonical content", () => {
    const pkg = buildScenarioPackage(
      {
        id: "local-1",
        name: "Iron Gate",
        initialGameMode: GameMode.STORY_TELLER,
        description: "A public scenario.",
        thumbnail: null,
        content: [
          {
            type: "prompt_component",
            version: 1,
            id: "plot",
            promptType: PromptComponentType.PLOT,
            content: "The city remembers every gate.",
          },
          {
            type: "story_card",
            version: 1,
            id: "gatekeeper",
            title: "Gatekeeper",
            triggers: [" gatekeeper ", "gatekeeper"],
            content: "The gatekeeper never sleeps.",
            category: StorybookCategory.CHARACTER,
            isPinned: false,
          },
        ],
      },
      {
        summary: "A gate waits.",
        language: "EN",
        category: "fantasy",
        tags: ["Magic", "magic,city"],
        ageRating: "teen",
      },
    );

    expect(pkg.format).toBe("hakawati-scenario-package");
    expect(pkg.scenario.tags).toEqual(["magic", "city"]);
    expect(pkg.scenario.content).toEqual([
      expect.objectContaining({
        type: "prompt_component",
        promptType: PromptComponentType.PLOT,
      }),
      expect.objectContaining({
        type: "story_card",
        triggers: ["gatekeeper"],
      }),
    ]);
    expect("components" in pkg.scenario).toBe(false);
  });

  it("rejects legacy split scenario-shaped packages", () => {
    expect(() =>
      parseScenarioPackage({
        format: "hakawati-scenario-package",
        formatVersion: 1,
        scenario: {
          title: "Old",
          summary: "Old split package.",
          language: "en",
          category: "other",
          tags: [],
          ageRating: "general",
          initialGameMode: GameMode.STORY_TELLER,
          description: "",
          components: [],
          content: [],
        },
      }),
    ).toThrow();
  });

  it("rejects more than twelve public tags", () => {
    expect(() =>
      buildScenarioPackage(
        {
          id: "local-1",
          name: "Iron Gate",
          initialGameMode: GameMode.STORY_TELLER,
          description: "A public scenario.",
          thumbnail: null,
          content: [
            {
              type: "prompt_component",
              version: 1,
              id: "plot",
              promptType: PromptComponentType.PLOT,
              content: "The city remembers every gate.",
            },
          ],
        },
        {
          tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`),
        },
      ),
    ).toThrow();
  });

  it("maps server start source to tale source metadata", () => {
    expect(
      catalogStartSourceToTaleSource({
        type: "catalog",
        catalogScenarioId: "catalog-1",
        catalogScenarioVersionId: "version-1",
        title: "Iron Gate",
      }),
    ).toEqual({
      type: "catalog",
      scenarioId: "catalog-1",
      scenarioVersionId: "version-1",
      scenarioTitle: "Iron Gate",
    });
  });
});
