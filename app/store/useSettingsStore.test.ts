import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiPreset, MODEL_ROLES } from "@/types";
import type { LLMModel } from "@/services/llm/schema";
import {
  DEFAULT_TTS_VOICE,
  isModelRoleConfigured,
  migrateSettingsState,
  useSettingsStore,
} from "./useSettingsStore";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const legacyModel: LLMModel = {
  id: "legacy-model",
  name: "Legacy Model",
  contextLength: 8192,
};

const otherModel: LLMModel = { id: "other-model", name: "Other Model" };

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

function connectionFor(
  state: ReturnType<typeof migrateSettingsState>,
  preset: ApiPreset,
) {
  return state.connections.find((c) => c.preset === preset);
}

beforeEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

afterEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

describe("useSettingsStore migration", () => {
  it("turns legacy single-model settings into one shared connection", () => {
    const migrated = migrateSettingsState({
      activePreset: ApiPreset.OPENROUTER,
      openAiBaseUrl: OPENROUTER_URL,
      apiKey: "legacy-key",
      model: legacyModel,
      profiles: {
        [ApiPreset.OPENROUTER]: {
          baseUrl: OPENROUTER_URL,
          apiKey: "legacy-key",
          model: legacyModel,
        },
      },
    });

    expect(migrated.connections).toEqual([
      expect.objectContaining({
        preset: ApiPreset.OPENROUTER,
        apiKey: "legacy-key",
      }),
    ]);
    for (const role of ["narrator", "utility"] as const) {
      expect(migrated.modelRoles[role]).toMatchObject({
        activePreset: ApiPreset.OPENROUTER,
        baseUrl: OPENROUTER_URL,
        apiKey: "legacy-key",
        model: legacyModel,
      });
    }
    expect(migrated.roleAssignments.utility.sameAsNarrator).toBe(true);
    expect(migrated.modelContextLength).toBe(8192);
    expect(migrated).not.toHaveProperty("openAiBaseUrl");
    expect(migrated).not.toHaveProperty("profiles");
  });

  it("lets themes choose the type for settings saved before themes had fonts", () => {
    expect(
      migrateSettingsState({ fontFamily: "system-ui" }, 6).fontFamily,
    ).toBe("theme");
    expect(migrateSettingsState({}, 6).fontFamily).toBe("theme");
    expect(
      migrateSettingsState({ fontFamily: "Lexend, Arial, sans-serif" }, 6)
        .fontFamily,
    ).toBe("Lexend, Arial, sans-serif");
    // Once themes have fonts, "System UI" is a deliberate choice.
    expect(
      migrateSettingsState({ fontFamily: "system-ui" }, 7).fontFamily,
    ).toBe("system-ui");
  });

  it("leaves theme scenery unset until the reader picks one", () => {
    expect(migrateSettingsState({}).themeScenery).toBeUndefined();
    expect(migrateSettingsState({ themeScenery: "still" }).themeScenery).toBe(
      "still",
    );
    expect(
      migrateSettingsState({ themeScenery: "moving" as never }).themeScenery,
    ).toBeUndefined();
  });

  it("starts with no connections when nothing was set up", () => {
    const migrated = migrateSettingsState({});

    expect(migrated.connections).toEqual([]);
    expect(isModelRoleConfigured(migrated.modelRoles.narrator)).toBe(false);
    expect(isModelRoleConfigured(migrated.modelRoles.utility)).toBe(false);
    expect(migrated.roleAssignments.utility.sameAsNarrator).toBe(true);
    expect(Object.keys(migrated.modelRoles).sort()).toEqual(
      [...MODEL_ROLES].sort(),
    );
    expect(migrated.modelRoles.textToSpeech.voice).toBe(DEFAULT_TTS_VOICE);
    expect(migrated.autoNarrate).toBe(false);
    expect(migrated.highlightLatestSection).toBe(true);
  });

  it.each(["legacy", "role"])(
    "keeps an active Venice configuration as another provider in %s settings",
    (format) => {
      const profile = {
        baseUrl: "https://api.venice.ai/api/v1",
        apiKey: "saved-venice-key",
        model: legacyModel,
      };
      const saved = {
        activePreset: "venice",
        profiles: { venice: profile },
      };
      const migrated = migrateSettingsState(
        format === "legacy" ? saved : { modelRoles: { narrator: saved } },
      );

      expect(migrated.modelRoles.narrator).toMatchObject({
        activePreset: ApiPreset.GENERIC,
        ...profile,
      });
      expect(migrated.connections).toEqual([
        expect.objectContaining({
          preset: ApiPreset.GENERIC,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
        }),
      ]);
    },
  );

  it.each(["legacy", "narrator", "utility"])(
    "keeps the Generic profile Venice displaced as its own connection in %s settings",
    (format) => {
      const generic = {
        baseUrl: "https://custom.example/v1",
        apiKey: "custom-key",
        model: { id: "custom-model", name: "Custom Model" },
      };
      const venice = {
        baseUrl: "https://api.venice.ai/api/v1",
        apiKey: "venice-key",
        model: legacyModel,
      };
      const saved = {
        activePreset: "venice",
        profiles: { generic, venice },
      };
      const migrated = migrateSettingsState(
        format === "legacy" ? saved : { modelRoles: { [format]: saved } },
      );
      const role = format === "utility" ? "utility" : "narrator";
      expect(migrated.modelRoles[role]).toMatchObject({
        activePreset: ApiPreset.GENERIC,
        ...venice,
      });
      expect(migrated.connections.map((c) => c.baseUrl).sort()).toEqual(
        [generic.baseUrl, venice.baseUrl].sort(),
      );
      // Settings saved after the migration load without migrating again.
      const reloaded = migrateSettingsState(
        JSON.parse(JSON.stringify(migrated)),
      );
      expect(reloaded.connections).toEqual(migrated.connections);
      expect(reloaded.modelRoles[role]).toMatchObject({
        ...venice,
        model: venice.model,
      });
    },
  );

  it.each(["legacy", "narrator", "utility"])(
    "does not inherit Generic's model when Venice has no selected model in %s settings",
    (format) => {
      const generic = {
        baseUrl: "https://custom.example/v1",
        apiKey: "custom-key",
        model: legacyModel,
      };
      const venice = {
        baseUrl: "https://api.venice.ai/api/v1",
        apiKey: "venice-key",
        model: undefined,
      };
      const saved = {
        activePreset: "venice",
        profiles: { generic, venice },
      };
      // Zustand JSON persistence omits both the active and profile model fields.
      const migrated = migrateSettingsState(
        JSON.parse(
          JSON.stringify(
            format === "legacy" ? saved : { modelRoles: { [format]: saved } },
          ),
        ),
      );
      const role = format === "utility" ? "utility" : "narrator";
      expect(migrated.modelRoles[role]).toMatchObject({
        activePreset: ApiPreset.GENERIC,
        baseUrl: venice.baseUrl,
        apiKey: venice.apiKey,
      });
      expect(migrated.modelRoles[role].model).toBeUndefined();
      expect(isModelRoleConfigured(migrated.modelRoles[role])).toBe(false);
    },
  );

  it("shares one connection between roles on the same account and keeps each role's model", () => {
    const openRouter = (model: LLMModel) => ({
      activePreset: ApiPreset.OPENROUTER,
      profiles: {
        [ApiPreset.OPENROUTER]: {
          baseUrl: OPENROUTER_URL,
          apiKey: "shared-key",
          model,
        },
      },
    });
    const migrated = migrateSettingsState({
      modelRoles: {
        narrator: openRouter(legacyModel),
        utility: openRouter(otherModel),
      },
    });

    expect(migrated.connections).toHaveLength(1);
    const id = migrated.connections[0].id;
    expect(migrated.roleAssignments.narrator).toMatchObject({
      connectionId: id,
      model: legacyModel,
    });
    expect(migrated.roleAssignments.utility).toMatchObject({
      connectionId: id,
      model: otherModel,
      sameAsNarrator: false,
    });
  });

  it("keeps saved keys of inactive providers and the model each role chose there", () => {
    const migrated = migrateSettingsState({
      modelRoles: {
        narrator: {
          activePreset: ApiPreset.OPENAI,
          profiles: {
            [ApiPreset.OPENAI]: {
              baseUrl: "https://api.openai.com/v1",
              apiKey: "openai-key",
              model: otherModel,
            },
            [ApiPreset.OPENROUTER]: {
              baseUrl: OPENROUTER_URL,
              apiKey: "openrouter-key",
              model: legacyModel,
            },
          },
        },
      },
    });
    const openRouter = connectionFor(migrated, ApiPreset.OPENROUTER)!;
    expect(openRouter.apiKey).toBe("openrouter-key");
    expect(migrated.modelRoles.narrator.activePreset).toBe(ApiPreset.OPENAI);

    useSettingsStore.setState(migrated);
    useSettingsStore.getState().setRoleConnection("narrator", openRouter.id);
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      legacyModel,
    );
  });

  it("keeps speech roles off ChatGPT and keeps the narration voice", () => {
    const migrated = migrateSettingsState({
      modelRoles: {
        speechToText: { activePreset: ApiPreset.CHATGPT, model: legacyModel },
        textToSpeech: {
          activePreset: ApiPreset.OPENROUTER,
          apiKey: "tts-key",
          model: otherModel,
          voice: "nova",
        },
      },
    });
    expect(migrated.modelRoles.speechToText.connectionId).toBeNull();
    expect(migrated.modelRoles.textToSpeech).toMatchObject({
      activePreset: ApiPreset.OPENROUTER,
      model: otherModel,
      voice: "nova",
    });
  });
});

describe("connections", () => {
  it("returns the existing connection for the same account, and keeps one ChatGPT", () => {
    const settings = useSettingsStore.getState();
    const first = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: " key-a ",
    });
    expect(
      settings.addConnection({ preset: ApiPreset.OPENROUTER, apiKey: "key-a" }),
    ).toBe(first);
    expect(
      settings.addConnection({ preset: ApiPreset.OPENROUTER, apiKey: "key-b" }),
    ).not.toBe(first);
    const chatGpt = settings.addConnection({ preset: ApiPreset.CHATGPT });
    expect(settings.addConnection({ preset: ApiPreset.CHATGPT })).toBe(chatGpt);
    expect(useSettingsStore.getState().connections).toHaveLength(3);
  });

  it("uses the preset's own address for fixed providers", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      baseUrl: "https://elsewhere.example/v1",
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    expect(useSettingsStore.getState().modelRoles.narrator.baseUrl).toBe(
      OPENROUTER_URL,
    );
  });

  it("restores the model a role last used on each connection", () => {
    const settings = useSettingsStore.getState();
    const a = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "a",
    });
    const b = settings.addConnection({ preset: ApiPreset.OPENAI, apiKey: "b" });
    settings.setRoleConnection("narrator", a);
    settings.setRoleModel("narrator", legacyModel);
    settings.setRoleConnection("narrator", b);
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
    settings.setRoleModel("narrator", otherModel);
    settings.setRoleConnection("narrator", a);
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      legacyModel,
    );
    settings.setRoleConnection("narrator", b);
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      otherModel,
    );
  });

  it("refuses connections a role cannot use", () => {
    const settings = useSettingsStore.getState();
    const chatGpt = settings.addConnection({ preset: ApiPreset.CHATGPT });
    settings.setRoleConnection("speechToText", chatGpt);
    expect(
      useSettingsStore.getState().roleAssignments.speechToText.connectionId,
    ).toBeNull();
  });

  it("lets the utility follow the narrator, then start from its choice", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", legacyModel);
    expect(useSettingsStore.getState().modelRoles.utility).toEqual(
      useSettingsStore.getState().modelRoles.narrator,
    );

    settings.setUtilitySameAsNarrator(false);
    settings.setRoleModel("utility", otherModel);
    const state = useSettingsStore.getState();
    expect(state.modelRoles.utility).toMatchObject({
      connectionId: id,
      model: otherModel,
    });
    expect(state.modelRoles.narrator.model).toEqual(legacyModel);
  });

  it("clears models when a connection's address changes", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.GENERIC,
      baseUrl: "https://one.example/v1",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", legacyModel);
    settings.updateConnection(id, { apiKey: "new-key" });
    expect(useSettingsStore.getState().modelRoles.narrator).toMatchObject({
      apiKey: "new-key",
      model: legacyModel,
    });
    settings.updateConnection(id, { baseUrl: "https://two.example/v1" });
    expect(useSettingsStore.getState().modelRoles.narrator).toMatchObject({
      baseUrl: "https://two.example/v1",
      model: undefined,
    });
  });

  it("unassigns roles when their connection is removed", () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleModel("narrator", legacyModel);
    settings.setRoleConnection("textToSpeech", id);
    settings.removeConnection(id);
    const state = useSettingsStore.getState();
    expect(state.connections).toEqual([]);
    expect(state.modelRoles.narrator.connectionId).toBeNull();
    expect(state.modelRoles.narrator.model).toBeUndefined();
    expect(state.modelRoles.textToSpeech.connectionId).toBeNull();
  });

  it("clears account-specific models, including saved ones, without touching other providers", () => {
    const settings = useSettingsStore.getState();
    const chatGpt = settings.addConnection({ preset: ApiPreset.CHATGPT });
    const other = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "other-provider-key",
    });
    settings.setRoleConnection("narrator", chatGpt);
    settings.setRoleModel("narrator", legacyModel);
    settings.setUtilitySameAsNarrator(false);
    settings.setRoleModel("utility", legacyModel);
    settings.setRoleConnection("utility", other);
    settings.setRoleModel("utility", otherModel);
    settings.clearChatGptModels("second-account");

    const state = useSettingsStore.getState();
    expect(state.modelRoles.narrator.model).toBeUndefined();
    expect(state.modelContextLength).toBe(0);
    expect(state.modelRoles.utility.model).toEqual(otherModel);
    expect(
      state.roleAssignments.utility.savedModels?.[chatGpt],
    ).toBeUndefined();
    expect(state.chatGptProfileId).toBe("second-account");
  });
});

describe("thinking-level settings", () => {
  const thinkingModel: LLMModel = {
    id: "provider/thinking-model",
    name: "Thinking Model",
    reasoning: { supportedEfforts: ["low", "medium", "high"] },
  };

  function connect(preset = ApiPreset.OPENROUTER, apiKey = "key") {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({ preset, apiKey });
    settings.setRoleConnection("narrator", id);
    return id;
  }

  it("migrates existing role profiles to Model default without choosing an effort", () => {
    const migrated = migrateSettingsState({
      modelRoles: {
        narrator: {
          activePreset: ApiPreset.OPENROUTER,
          apiKey: "key",
          model: thinkingModel,
        },
      },
    });
    expect(migrated.modelRoles.narrator.reasoningEffort).toBeUndefined();
    expect(migrated.modelRoles.narrator.model).toEqual(thinkingModel);
    expect(useSettingsStore.persist.getOptions().version).toBe(8);
  });

  it("normalizes invalid persisted levels", () => {
    const migrated = migrateSettingsState({
      modelRoles: {
        narrator: {
          activePreset: ApiPreset.OPENROUTER,
          apiKey: "key",
          model: thinkingModel,
          reasoningEffort: "max",
        },
        utility: {
          activePreset: ApiPreset.OPENROUTER,
          apiKey: "key",
          model: thinkingModel,
          reasoningEffort: "low",
        },
      },
    });
    expect(migrated.modelRoles.narrator.reasoningEffort).toBeUndefined();
    expect(migrated.modelRoles.utility.reasoningEffort).toBe("low");
  });

  it("stores independent levels for each role and connection", () => {
    const settings = useSettingsStore.getState();
    const openRouter = connect();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setUtilitySameAsNarrator(false);
    settings.setRoleReasoningEffort("utility", "low");

    const openAi = connect(ApiPreset.OPENAI);
    settings.setRoleModel("narrator", thinkingModel);
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    settings.setRoleReasoningEffort("narrator", "medium");
    settings.setRoleConnection("narrator", openRouter);

    const current = useSettingsStore.getState();
    expect(current.modelRoles.narrator.reasoningEffort).toBe("high");
    expect(
      current.roleAssignments.narrator.savedModels?.[openAi].reasoningEffort,
    ).toBe("medium");
    expect(current.modelRoles.utility.reasoningEffort).toBe("low");
  });

  it("retains a supported effort on model refresh and clears unsupported choices", () => {
    const settings = useSettingsStore.getState();
    connect();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleModel("narrator", { ...thinkingModel, name: "Refreshed" });
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBe("high");
    settings.setRoleModel("narrator", {
      ...thinkingModel,
      reasoning: { supportedEfforts: ["low"] },
    });
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    settings.setRoleReasoningEffort("narrator", "high");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    settings.setRoleReasoningEffort("narrator", "low");
    settings.setRoleModel("narrator", legacyModel);
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
  });

  it("clears thinking levels when the account behind a connection changes", () => {
    const settings = useSettingsStore.getState();
    const id = connect();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.updateConnection(id, { apiKey: "different-account" });
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      thinkingModel,
    );
  });

  it("persists connections and levels, and rebuilds roles on reload", async () => {
    const settings = useSettingsStore.getState();
    connect();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    const saved = localStorage.getItem("settings")!;
    const persisted = JSON.parse(saved).state;
    expect(persisted).not.toHaveProperty("modelRoles");
    expect(persisted.roleAssignments.narrator.reasoningEffort).toBe("high");
    expect(persisted.connections[0].apiKey).toBe("key");

    useSettingsStore.setState(useSettingsStore.getInitialState());
    localStorage.setItem("settings", saved);
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().modelRoles.narrator).toMatchObject({
      activePreset: ApiPreset.OPENROUTER,
      model: thinkingModel,
      reasoningEffort: "high",
    });
    expect(useSettingsStore.getState().modelRoles.utility.model).toEqual(
      thinkingModel,
    );
  });

  it("does not apply thinking levels to speech roles", () => {
    const settings = useSettingsStore.getState();
    const id = connect();
    settings.setRoleConnection("textToSpeech", id);
    settings.setRoleModel("textToSpeech", thinkingModel);
    settings.setRoleReasoningEffort("textToSpeech", "high");
    expect(
      useSettingsStore.getState().modelRoles.textToSpeech.reasoningEffort,
    ).toBeUndefined();
  });
});
