import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deserializeScenarioExport,
  serializeScenarioExport,
  initTaleFromScenario,
  saveScenario,
} from "./scenario.service";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
  type Scenario,
} from "@/types/context.type";

const mocks = vi.hoisted(() => ({
  getScenario: vi.fn(),
  upsertScenario: vi.fn(),
  initTale: vi.fn(),
  markNewTaleSyncPreference: vi.fn(),
}));
vi.mock("@/repositories/scenario.repository", () => ({
  ...mocks,
  getScenarioHead: vi.fn(),
  deleteScenario: vi.fn(),
  getScenarios: vi.fn(),
}));
vi.mock("@/services/tale.service", () => ({ initTale: mocks.initTale }));
vi.mock("@/services/new-tale-sync", () => ({
  markNewTaleSyncPreference: mocks.markNewTaleSyncPreference,
}));

describe("scenario starts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initTale.mockResolvedValue("tale-1");
  });
  const template = (): Scenario => ({
    id: "scenario-1",
    name: "Gate",
    description: "A gate waits.",
    initialGameMode: GameMode.GM,
    content: [
      {
        type: "prompt_component",
        version: 1,
        id: "opening",
        promptType: PromptComponentType.OPENING,
        content: "Welcome, ${Name?}.",
      },
      {
        type: "prompt_component",
        version: 1,
        id: "plot",
        promptType: PromptComponentType.PLOT,
        content: "${Name?} is a ${Role? | choices: Mage, Knight}.",
      },
      {
        type: "story_card",
        version: 1,
        id: "card",
        title: "${Name?}",
        content: "${Name?} guards the gate.",
        triggers: ["${Name?}"],
        category: StorybookCategory.CHARACTER,
        isPinned: false,
      },
      {
        type: "stat",
        version: 1,
        id: "stat",
        name: "${Role?} power",
        description: "For ${Name?}",
        value: 5,
        range: [0, 10],
      },
      {
        type: "inventory_item",
        version: 1,
        id: "item",
        name: "${Name?}'s key",
        description: "A ${Role?}'s key",
      },
    ],
  });
  it("uses the held snapshot and resolves all gameplay text before saving a private tale", async () => {
    const snapshot = template();
    await expect(
      initTaleFromScenario(snapshot.id, {
        scenarioSnapshot: snapshot,
        answers: { "Name?": "Mira", "Role?": "Mage" },
        syncPolicy: "private",
      }),
    ).resolves.toBe("tale-1");
    expect(mocks.getScenario).not.toHaveBeenCalled();
    expect(mocks.initTale).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Gate",
        description: "A gate waits.",
        log: [expect.objectContaining({ text: "Welcome, Mira." })],
        components: [expect.objectContaining({ content: "Mira is a Mage." })],
        storyCards: [
          expect.objectContaining({
            title: "Mira",
            content: "Mira guards the gate.",
            triggers: ["Mira"],
          }),
        ],
        stats: [
          {
            name: "Mage power",
            description: "For Mira",
            value: 5,
            range: [0, 10],
          },
        ],
        inventory: [
          { id: "item", name: "Mira's key", description: "A Mage's key" },
        ],
      }),
    );
    expect(mocks.markNewTaleSyncPreference).toHaveBeenCalledWith(
      "tale-1",
      "private",
    );
    expect(snapshot).toEqual(template());
  });
  it("rejects missing answers and invalid fixed choices without creating a tale", async () => {
    const scenarioSnapshot = template();
    await expect(
      initTaleFromScenario(scenarioSnapshot.id, { scenarioSnapshot }),
    ).rejects.toThrow();
    await expect(
      initTaleFromScenario(scenarioSnapshot.id, {
        scenarioSnapshot,
        answers: { "Name?": "Mira", "Role?": "Scout" },
      }),
    ).rejects.toThrow();
    expect(mocks.initTale).not.toHaveBeenCalled();
    expect(mocks.markNewTaleSyncPreference).not.toHaveBeenCalled();
  });
  it("still starts a scenario with no questions and allows saving unfinished drafts", async () => {
    const scenario = template();
    scenario.content = [];
    mocks.getScenario.mockResolvedValue(scenario);
    await expect(initTaleFromScenario(scenario.id)).resolves.toBe("tale-1");
    const draft = template();
    draft.content = [
      {
        type: "prompt_component",
        version: 1,
        id: "opening",
        promptType: PromptComponentType.OPENING,
        content: "${unfinished",
      },
    ];
    await saveScenario(draft);
    expect(mocks.upsertScenario).toHaveBeenCalledWith(
      expect.objectContaining({ content: draft.content }),
      undefined,
    );
  });
  it("preserves inline questions and escapes in v3 export/import", () => {
    const scenario = template();
    const copy = deserializeScenarioExport(serializeScenarioExport(scenario));
    expect(copy.content).toEqual(scenario.content);
  });
});

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
    const json = serializeScenarioExport({
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
    const json = serializeScenarioExport({
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
