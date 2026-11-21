import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiPreset, type LLMModel } from "@/types";
import { migrateSettingsState, useSettingsStore } from "./useSettingsStore";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const narratorModel: LLMModel = { id: "narrator-model", name: "Narrator" };
const ownModel: LLMModel = { id: "own-model", name: "Own" };

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

afterEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

describe("Hakawati model role", () => {
  it("follows the narrator by default", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", narratorModel);
    const state = useSettingsStore.getState();
    expect(state.roleAssignments.hakawati.sameAsNarrator).toBe(true);
    expect(state.modelRoles.hakawati).toEqual(state.modelRoles.narrator);
  });

  it("can use its own connection and model and its own thinking level", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", narratorModel);
    settings.setRoleSameAsNarrator("hakawati", false);
    settings.setRoleModel("hakawati", {
      ...ownModel,
      reasoning: { supportedEfforts: ["low", "high"] },
    });
    settings.setRoleReasoningEffort("hakawati", "high");
    const state = useSettingsStore.getState();
    expect(state.modelRoles.hakawati).toMatchObject({
      connectionId: id,
      model: { id: "own-model" },
      reasoningEffort: "high",
    });
    expect(state.modelRoles.narrator.model).toEqual(narratorModel);
    expect(state.modelRoles.utility.model).toEqual(narratorModel);
  });

  it("stops following when given its own connection", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("hakawati", id);
    expect(
      useSettingsStore.getState().roleAssignments.hakawati.sameAsNarrator,
    ).toBe(false);
  });

  it("follows the narrator after an upgrade from per-role settings", () => {
    const migrated = migrateSettingsState({
      activePreset: ApiPreset.OPENROUTER,
      openAiBaseUrl: "https://openrouter.ai/api/v1",
      apiKey: "legacy-key",
      model: narratorModel,
    });
    expect(migrated.roleAssignments.hakawati.sameAsNarrator).toBe(true);
    expect(migrated.modelRoles.hakawati.model).toEqual(narratorModel);
  });

  it("follows the narrator in settings saved before it existed", async () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", narratorModel);
    const saved = JSON.parse(localStorage.getItem("settings")!);
    delete saved.state.roleAssignments.hakawati;

    useSettingsStore.setState(useSettingsStore.getInitialState());
    localStorage.setItem("settings", JSON.stringify(saved));
    await useSettingsStore.persist.rehydrate();
    const state = useSettingsStore.getState();
    expect(state.roleAssignments.hakawati.sameAsNarrator).toBe(true);
    expect(state.modelRoles.hakawati.model).toEqual(narratorModel);
  });
});
