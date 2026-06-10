import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, StorybookCategory } from "@/types/context.type";
import { QUICKSTART_TALE_GENERATOR_PROMPT } from "@/prompts/system";
import {
  buildQuickstartTalePrompt,
  generateQuickstartTale,
} from "./quickstartTaleGenerator";

const { sendRoleChatMock, resolveModelRoleMock } = vi.hoisted(() => ({
  sendRoleChatMock: vi.fn(),
  resolveModelRoleMock: vi.fn(),
}));

vi.mock("@/services/llm", () => ({
  sendRoleChat: sendRoleChatMock,
  resolveModelRole: resolveModelRoleMock,
}));

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("nanoid", () => ({
  nanoid: (size?: number) => `id-${size ?? "default"}`,
}));

const baseAnswers = {
  gameMode: GameMode.GM,
  world: "Fantasy",
  characterName: "Mira",
  archetype: "Mage",
  tone: "Serious",
};

describe("quickstart tale generator", () => {
  beforeEach(() => {
    sendRoleChatMock.mockReset();
    resolveModelRoleMock.mockReset();
    resolveModelRoleMock.mockReturnValue({
      model: { id: "utility-model", name: "Utility Model" },
    });
  });

  it("builds a prompt from guided answers and runtime field usage", () => {
    const prompt = buildQuickstartTalePrompt({
      ...baseAnswers,
      world: "Custom: clockwork desert",
      archetype: "Custom: oathbound cartographer",
      tone: "Custom: eerie but hopeful",
      extraDetails: "Include a vanished caravan.",
    });

    expect(prompt).toContain("Game mode: Game Master (gm)");
    expect(prompt).toContain("World: Custom: clockwork desert");
    expect(prompt).toContain("Player character name: Mira");
    expect(prompt).toContain(
      "Player character archetype: Custom: oathbound cartographer",
    );
    expect(prompt).toContain("Narrative tone: Custom: eerie but hopeful");
    expect(prompt).toContain(
      "Additional user details: Include a vanished caravan.",
    );
    expect(prompt).toContain(
      "plot is saved as the tale's persistent story context",
    );
    expect(prompt).toContain("Use it only for specific user-requested style");
    expect(prompt).toContain("description is saved as a user-facing tale");
    expect(prompt).toContain(
      "openingText is saved as the first visible tale entry",
    );
    expect(prompt).toContain(
      "The user will not review the generated setup before play begins.",
    );
  });

  it("describes quickstart output fields by runtime use", () => {
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain('"description"');
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "Core tale context sent with every future turn",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain('"authorNote"');
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "Otherwise use an empty string",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "reusable continuity material",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "The first visible tale entry",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "Story card content must name the card's subject directly",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).toContain(
      "Do not decide what the player character does, says, feels, believes, or chooses",
    );

    const forbiddenProductNamePattern = new RegExp(
      ["AI", "\\s*", "Dungeon"].join(""),
      "i",
    );
    expect(QUICKSTART_TALE_GENERATOR_PROMPT).not.toMatch(
      forbiddenProductNamePattern,
    );
  });

  it("omits optional details when none are provided", () => {
    const prompt = buildQuickstartTalePrompt(baseAnswers);

    expect(prompt).not.toContain("Additional user details:");
  });

  it("omits narrative tone when the optional tone is blank", () => {
    const prompt = buildQuickstartTalePrompt({
      ...baseAnswers,
      tone: "",
    });

    expect(prompt).not.toContain("Narrative tone:");
  });

  it("generates and normalizes a GM tale from valid JSON", async () => {
    sendRoleChatMock.mockResolvedValue({
      content: JSON.stringify({
        name: "Ash Over Moonwell",
        description: "Mira stands at the edge of a wounded kingdom.",
        authorNote: "Keep the prose ash-dry and ominous.",
        openingText: "Smoke beads on your tongue.",
        storyCards: [
          {
            title: "Moonwell",
            triggers: ["moonwell"],
            content: "An old source of dangerous magic.",
            category: "Place",
          },
          {
            title: "Wrong Category",
            triggers: [],
            content: "This should fall back.",
            category: "Mood",
          },
        ],
        stats: [
          { name: "HP", value: 18, range: [0], description: "Health" },
          { name: "Mana", value: 7 },
        ],
        inventory: [
          "Ash-marked Key",
          { name: "Cracked Wand", description: "Warm to the touch" },
        ],
      }),
    });

    const result = await generateQuickstartTale(baseAnswers);

    expect(sendRoleChatMock).toHaveBeenCalledWith(
      "utility",
      expect.objectContaining({
        model: "utility-model",
        stream: false,
        max_tokens: 4000,
      }),
      undefined,
    );
    expect(sendRoleChatMock.mock.calls[0][1].messages[0]).toMatchObject({
      role: "system",
      content: QUICKSTART_TALE_GENERATOR_PROMPT,
    });
    expect(result).toMatchObject({
      name: "Ash Over Moonwell",
      description: "Mira stands at the edge of a wounded kingdom.",
      authorNote: "Keep the prose ash-dry and ominous.",
      openingText: "Smoke beads on your tongue.",
      stats: [
        { name: "HP", value: 18, range: [0, 100], description: "Health" },
        { name: "Mana", value: 7, range: [0, 100] },
      ],
      inventory: [
        { id: "id-12", name: "Ash-marked Key" },
        {
          id: "id-12",
          name: "Cracked Wand",
          description: "Warm to the touch",
        },
      ],
    });
    expect(result.storyCards[0]).toMatchObject({
      id: "id-12",
      title: "Moonwell",
      category: StorybookCategory.PLACE,
      isPinned: false,
    });
    expect(result.storyCards[1].category).toBe(StorybookCategory.UNCATEGORIZED);
  });

  it("parses fenced JSON and clears stats/inventory for Story Teller tales", async () => {
    sendRoleChatMock.mockResolvedValue({
      content: `\`\`\`json
{
  "name": "Glass Rain",
  "description": "A quiet impossible storm begins.",
  "openingText": "The first shard taps the window.",
  "storyCards": [],
  "stats": [{ "name": "Luck", "value": 3, "range": [0, 10] }],
  "inventory": ["Umbrella"]
}
\`\`\``,
    });

    const result = await generateQuickstartTale({
      ...baseAnswers,
      gameMode: GameMode.STORY_TELLER,
    });

    expect(result.stats).toEqual([]);
    expect(result.inventory).toEqual([]);
    expect(result.authorNote).toBe("");
    expect(result.name).toBe("Glass Rain");
  });

  it("throws a parse error for invalid JSON", async () => {
    sendRoleChatMock.mockResolvedValue({ content: "not json" });

    await expect(generateQuickstartTale(baseAnswers)).rejects.toThrow(
      /Failed to parse quickstart tale response/,
    );
  });
});
