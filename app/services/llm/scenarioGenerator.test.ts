import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateScenario } from "./scenarioGenerator";
import { SCENARIO_GENERATOR_PROMPT } from "@/prompts/system";

const llm = vi.hoisted(() => ({
  sendRoleChat: vi.fn(),
  resolveModelRole: vi.fn(() => ({ model: { id: "utility-model" } })),
}));
vi.mock("@/services/llm", () => llm);
vi.mock("@/prompts", async () => {
  const { SCENARIO_GENERATOR_PROMPT } = await import("@/prompts/system");
  return { getActiveScenarioGeneratorPrompt: () => SCENARIO_GENERATOR_PROMPT };
});

const output = (plot: string) => ({
  name: "Gate",
  description: "A gate waits.",
  initialGameMode: "story_teller",
  plot,
  authorNote: "",
  openingText: "${Name?} arrives.",
  initialStats: [],
  initialInventory: [],
  initialStoryCards: [
    {
      title: "${Name?}",
      triggers: ["${Name?}"],
      content: "${Name?} is a traveler.",
    },
  ],
});

describe("scenario generation with questions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps valid questions in the editable scenario using the default prompt", async () => {
    llm.sendRoleChat.mockResolvedValue({
      content: JSON.stringify(
        output("${Name?} is a ${Role? | options: Mage, Scout}."),
      ),
    });
    const result = await generateScenario("A mysterious gate");
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "${Name?} is a ${Role? | options: Mage, Scout}.",
        }),
      ]),
    );
    expect(llm.sendRoleChat).toHaveBeenCalledTimes(1);
    expect(llm.sendRoleChat).toHaveBeenCalledWith(
      "utility",
      expect.objectContaining({
        max_tokens: 16000,
        messages: [
          { role: "system", content: SCENARIO_GENERATOR_PROMPT },
          { role: "user", content: "A mysterious gate" },
        ],
      }),
      undefined,
    );
  });
  it("rejects malformed generated questions instead of accepting a broken scenario", async () => {
    llm.sendRoleChat.mockResolvedValue({
      content: JSON.stringify(output("${Role? | unknown: Mage}")),
    });
    await expect(generateScenario("A gate")).rejects.toThrow();
  });
});
