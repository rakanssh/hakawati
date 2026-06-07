import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, StorybookCategory } from "@/types/context.type";
import {
  buildQuickstartTalePrompt,
  generateQuickstartTale,
  QUICKSTART_AUTHOR_NOTE,
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

  it("builds a prompt from guided answers and fixed author note rules", () => {
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
    expect(prompt).toContain(QUICKSTART_AUTHOR_NOTE);
    expect(prompt).toContain("do not include an authorNote field");
  });

  it("omits optional details when none are provided", () => {
    const prompt = buildQuickstartTalePrompt(baseAnswers);

    expect(prompt).not.toContain("Additional user details:");
  });

  it("generates and normalizes a GM tale from valid JSON", async () => {
    sendRoleChatMock.mockResolvedValue({
      content: JSON.stringify({
        name: "Ash Over Moonwell",
        description: "Mira stands at the edge of a wounded kingdom.",
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
    expect(result).toMatchObject({
      name: "Ash Over Moonwell",
      description: "Mira stands at the edge of a wounded kingdom.",
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
    expect(result.name).toBe("Glass Rain");
  });

  it("throws a parse error for invalid JSON", async () => {
    sendRoleChatMock.mockResolvedValue({ content: "not json" });

    await expect(generateQuickstartTale(baseAnswers)).rejects.toThrow(
      /Failed to parse quickstart tale response/,
    );
  });
});
