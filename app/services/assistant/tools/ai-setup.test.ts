import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMModel } from "@/types/model.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
const { getConnectionModels } = vi.hoisted(() => ({
  getConnectionModels: vi.fn(),
}));
vi.mock("@/services/llm", () => ({ getConnectionModels }));

const { createAiSetupTools } = await import("./ai-setup");
const { useSettingsStore } = await import("@/store/useSettingsStore");
const { ApiPreset } = await import("@/types");

const models: LLMModel[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    supportsToolCalls: true,
    reasoning: { supportedEfforts: ["low", "high"] },
  },
  {
    id: "anthropic/claude-opus-4.1",
    name: "Claude Opus 4.1",
    supportsToolCalls: true,
  },
  { id: "tiny/plain", name: "Plain", supportsToolCalls: false },
];

const initial = useSettingsStore.getState();
let recorded: unknown[];
let later: Array<() => void | Promise<void>>;
const call = (args: Record<string, unknown>) =>
  createAiSetupTools({
    getPathname: () => "/",
    recordChanges: (changes) => recorded.push(...changes),
    afterRun: (task) => later.push(task),
  })[0].run(args, undefined);

beforeEach(() => {
  useSettingsStore.setState(initial, true);
  const id = useSettingsStore
    .getState()
    .addConnection({ preset: ApiPreset.OPENROUTER, apiKey: "secret-key" });
  useSettingsStore.getState().setRoleConnection("narrator", id);
  getConnectionModels.mockReset();
  getConnectionModels.mockResolvedValue(models);
  recorded = [];
  later = [];
});

describe("ai_setup", () => {
  it("shows the setup without keys or addresses", async () => {
    const result = await call({ action: "get" });
    expect(JSON.stringify(result)).not.toMatch(/secret-key|openrouter\.ai/);
    expect(result).toMatchObject({
      connections: [{ preset: "openrouter" }],
      roles: { helper: { sameAsNarrator: true } },
    });
  });

  it("picks a model from the player's words and records the role", async () => {
    const result = await call({
      action: "set",
      role: "helper",
      model: "sonnet",
    });
    expect(result).toMatchObject({
      changed: true,
      model: "anthropic/claude-sonnet-4.5",
    });
    const helper = useSettingsStore.getState().roleAssignments.utility;
    expect(helper).toMatchObject({
      sameAsNarrator: false,
      model: expect.objectContaining({ id: "anthropic/claude-sonnet-4.5" }),
    });
    expect(recorded).toEqual([
      expect.objectContaining({
        kind: "role",
        role: "utility",
        label: "Claude Sonnet 4.5",
      }),
    ]);
  });

  it("asks which model when the words fit several", async () => {
    const result = await call({
      action: "set",
      role: "narrator",
      model: "claude",
    });
    expect(result).toMatchObject({ changed: false, ambiguous: [{}, {}] });
    expect(recorded).toEqual([]);
  });

  it("explains when the models can't be listed", async () => {
    getConnectionModels.mockRejectedValue(new Error("401"));
    await expect(
      call({ action: "set", role: "narrator", model: "sonnet" }),
    ).rejects.toThrow(/Settings › AI Setup/);
  });

  it("only offers the thinking levels the model has", async () => {
    await call({ action: "set", role: "narrator", model: "sonnet" });
    await later.shift()!();
    await expect(
      call({ action: "set", role: "narrator", thinking: "medium" }),
    ).rejects.toThrow(/low, high/);
    await call({ action: "set", role: "narrator", thinking: "high" });
    await later.shift()!();
    expect(
      useSettingsStore.getState().roleAssignments.narrator.reasoningEffort,
    ).toBe("high");
  });

  it("switches Hakawati's own model once the reply is done", async () => {
    const result = await call({
      action: "set",
      role: "hakawati",
      model: "plain",
    });
    expect(result).toMatchObject({
      appliesAfterThisReply: true,
      warnings: [expect.stringMatching(/may not be able to make changes/)],
    });
    expect(
      useSettingsStore.getState().roleAssignments.hakawati.sameAsNarrator,
    ).toBe(true);
    expect(later).toHaveLength(1);
    await later[0]();
    expect(useSettingsStore.getState().roleAssignments.hakawati.model?.id).toBe(
      "tiny/plain",
    );
    expect(recorded).toEqual([expect.objectContaining({ role: "hakawati" })]);
  });
});
