import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiPreset, MODEL_ROLES } from "@/types";
import type { LLMModel } from "@/services/llm/schema";
import {
  DEFAULT_TTS_VOICE,
  isModelRoleConfigured,
  migrateSettingsState,
  createDefaultModelRoles,
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

describe("useSettingsStore migration", () => {
  it("copies legacy single-model settings into narrator and utility roles", () => {
    const migrated = migrateSettingsState({
      activePreset: ApiPreset.OPENROUTER,
      openAiBaseUrl: "https://openrouter.ai/api/v1",
      apiKey: "legacy-key",
      model: legacyModel,
      profiles: {
        [ApiPreset.OPENROUTER]: {
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "legacy-key",
          model: legacyModel,
        },
      },
    });

    expect(migrated.modelRoles.narrator).toMatchObject({
      activePreset: ApiPreset.OPENROUTER,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "legacy-key",
      model: legacyModel,
    });
    expect(migrated.modelRoles.utility).toMatchObject({
      activePreset: ApiPreset.OPENROUTER,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "legacy-key",
      model: legacyModel,
    });
    expect(migrated.model).toBe(legacyModel);
    expect(migrated.openAiBaseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("creates empty role configs when no legacy model settings exist", () => {
    const migrated = migrateSettingsState({});

    expect(isModelRoleConfigured(migrated.modelRoles.narrator)).toBe(false);
    expect(isModelRoleConfigured(migrated.modelRoles.utility)).toBe(false);
  });

  it.each(["legacy", "role"])(
    "preserves an active Venice configuration as Generic OpenAI in %s settings",
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
      expect(migrated.modelRoles.narrator.profiles[ApiPreset.GENERIC]).toEqual(
        profile,
      );
      expect(migrated.modelRoles.narrator.profiles).not.toHaveProperty(
        "venice",
      );
      expect(migrated.activePreset).toBe(ApiPreset.GENERIC);
      expect(migrated.openAiBaseUrl).toBe(profile.baseUrl);
    },
  );

  it("creates persisted schema slots for future speech roles", () => {
    const migrated = migrateSettingsState({});

    expect(Object.keys(migrated.modelRoles).sort()).toEqual(
      [...MODEL_ROLES].sort(),
    );
    expect(migrated.modelRoles.speechToText).toBeDefined();
    expect(migrated.modelRoles.textToSpeech).toBeDefined();
    expect(migrated.modelRoles.textToSpeech.voice).toBe(DEFAULT_TTS_VOICE);
    expect(migrated.autoNarrate).toBe(false);
    expect(migrated.highlightLatestSection).toBe(true);
  });

  it.each(["legacy", "narrator", "utility"])(
    "retains the displaced Generic profile when Venice is active in %s settings",
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
        profiles: { generic: venice },
        retiredProfiles: { generic },
      });
      // A later persisted-state migration must keep the recovery copy intact.
      const remigrated = migrateSettingsState(
        JSON.parse(JSON.stringify(migrated)),
      );
      expect(remigrated.modelRoles[role].retiredProfiles).toEqual({ generic });
      expect(remigrated.modelRoles[role].profiles[ApiPreset.GENERIC]).toEqual(
        venice,
      );
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
        ...venice,
        retiredProfiles: { generic },
      });
      expect(
        migrated.modelRoles[role].profiles[ApiPreset.GENERIC].model,
      ).toBeUndefined();
      expect(isModelRoleConfigured(migrated.modelRoles[role])).toBe(false);
    },
  );

  it("adds ChatGPT profiles to existing role settings without changing their providers", () => {
    const modelRoles = createDefaultModelRoles();
    for (const config of Object.values(modelRoles)) {
      delete (config.profiles as Partial<typeof config.profiles>)[
        ApiPreset.CHATGPT
      ];
    }
    modelRoles.narrator = {
      ...modelRoles.narrator,
      apiKey: "existing-key",
      model: legacyModel,
    };
    const migrated = migrateSettingsState({ modelRoles });
    expect(migrated.modelRoles.narrator).toMatchObject({
      activePreset: ApiPreset.GENERIC,
      apiKey: "existing-key",
      model: legacyModel,
    });
    expect(migrated.modelRoles.narrator.profiles[ApiPreset.CHATGPT]).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: undefined,
    });
  });

  it("clears account-specific models including inactive ChatGPT profiles without changing other providers", () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.narrator.activePreset = ApiPreset.CHATGPT;
    modelRoles.narrator.model = legacyModel;
    modelRoles.utility.model = legacyModel;
    modelRoles.utility.apiKey = "other-provider-key";
    modelRoles.utility.profiles[ApiPreset.CHATGPT].model = legacyModel;
    useSettingsStore.setState({ modelRoles });
    useSettingsStore.getState().clearChatGptModels("second-account");
    const settings = useSettingsStore.getState();
    expect(settings.modelRoles.narrator.model).toBeUndefined();
    expect(settings.model).toBeUndefined();
    expect(settings.modelRoles.utility.model).toEqual(legacyModel);
    expect(settings.modelRoles.utility.apiKey).toBe("other-provider-key");
    expect(
      settings.modelRoles.utility.profiles[ApiPreset.CHATGPT].model,
    ).toBeUndefined();
    expect(settings.chatGptProfileId).toBe("second-account");
  });
});

describe("thinking-level settings", () => {
  const thinkingModel: LLMModel = {
    id: "provider/thinking-model",
    name: "Thinking Model",
    reasoning: { supportedEfforts: ["low", "medium", "high"] },
  };

  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("migrates existing role profiles to Model default without choosing an effort", () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.narrator.model = thinkingModel;
    modelRoles.utility.model = thinkingModel;
    const migrated = migrateSettingsState({ modelRoles });
    expect(migrated.modelRoles.narrator.reasoningEffort).toBeUndefined();
    expect(migrated.modelRoles.utility.reasoningEffort).toBeUndefined();
    expect(migrated.modelRoles.narrator.model).toEqual(thinkingModel);
    expect(useSettingsStore.persist.getOptions().version).toBe(6);
  });

  it("normalizes invalid persisted levels in active and inactive profiles", () => {
    const migrated = migrateSettingsState({
      modelRoles: {
        narrator: {
          activePreset: ApiPreset.OPENROUTER,
          model: thinkingModel,
          reasoningEffort: "max",
          profiles: {
            [ApiPreset.OPENROUTER]: {
              baseUrl: "https://openrouter.ai/api/v1",
              model: thinkingModel,
              reasoningEffort: "max",
            },
            [ApiPreset.GENERIC]: {
              baseUrl: "https://custom.example/v1",
              model: legacyModel,
              reasoningEffort: "high",
            },
          },
        },
        utility: {
          model: thinkingModel,
          reasoningEffort: "low",
        },
      },
    });
    expect(migrated.modelRoles.narrator.reasoningEffort).toBeUndefined();
    expect(
      migrated.modelRoles.narrator.profiles[ApiPreset.OPENROUTER]
        .reasoningEffort,
    ).toBeUndefined();
    expect(
      migrated.modelRoles.narrator.profiles[ApiPreset.GENERIC].reasoningEffort,
    ).toBeUndefined();
    expect(migrated.modelRoles.utility.reasoningEffort).toBe("low");
  });

  it("stores independent levels for each role and provider profile", () => {
    const settings = useSettingsStore.getState();
    settings.setRoleActivePreset("narrator", ApiPreset.OPENROUTER);
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleModel("utility", thinkingModel);
    settings.setRoleReasoningEffort("utility", "low");
    settings.setThinkingVisibility("none");

    settings.setRoleActivePreset("narrator", ApiPreset.OPENAI);
    settings.setRoleModel("narrator", thinkingModel);
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    settings.setRoleReasoningEffort("narrator", "medium");
    settings.setRoleActivePreset("narrator", ApiPreset.OPENROUTER);

    const current = useSettingsStore.getState();
    expect(current.modelRoles.narrator.reasoningEffort).toBe("high");
    expect(
      current.modelRoles.narrator.profiles[ApiPreset.OPENAI].reasoningEffort,
    ).toBe("medium");
    expect(current.modelRoles.utility.reasoningEffort).toBe("low");
    expect(current.thinkingVisibility).toBe("none");
    settings.setRoleReasoningEffort("narrator", undefined);
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    expect(
      useSettingsStore.getState().modelRoles.narrator.profiles[
        ApiPreset.OPENROUTER
      ].reasoningEffort,
    ).toBeUndefined();
  });

  it("retains a supported effort on model refresh and clears unsupported choices", () => {
    const settings = useSettingsStore.getState();
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

  it("clears thinking levels when a URL or API account changes", () => {
    const settings = useSettingsStore.getState();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleApiKey("narrator", "different-account");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleBaseUrl("narrator", "https://other.example/v1");
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
  });

  it("clears active and saved ChatGPT levels when the subscription account changes", () => {
    const settings = useSettingsStore.getState();
    settings.setRoleActivePreset("narrator", ApiPreset.CHATGPT);
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleActivePreset("utility", ApiPreset.CHATGPT);
    settings.setRoleModel("utility", thinkingModel);
    settings.setRoleReasoningEffort("utility", "low");
    settings.setRoleActivePreset("utility", ApiPreset.OPENROUTER);
    settings.setRoleModel("utility", thinkingModel);
    settings.setRoleReasoningEffort("utility", "medium");
    settings.clearChatGptModels("new-account");

    const current = useSettingsStore.getState();
    expect(current.modelRoles.narrator.reasoningEffort).toBeUndefined();
    expect(
      current.modelRoles.narrator.profiles[ApiPreset.CHATGPT].reasoningEffort,
    ).toBeUndefined();
    expect(
      current.modelRoles.utility.profiles[ApiPreset.CHATGPT].reasoningEffort,
    ).toBeUndefined();
    expect(current.modelRoles.utility.reasoningEffort).toBe("medium");
  });

  it("persists thinking levels and Model default through reload", async () => {
    const settings = useSettingsStore.getState();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    settings.setRoleModel("utility", thinkingModel);
    settings.setRoleReasoningEffort("utility", "low");
    settings.setRoleReasoningEffort("utility", undefined);
    const saved = localStorage.getItem("settings")!;
    expect(JSON.parse(saved).state.modelRoles.narrator.reasoningEffort).toBe(
      "high",
    );
    expect(JSON.parse(saved).state.modelRoles.utility).not.toHaveProperty(
      "reasoningEffort",
    );
    useSettingsStore.setState(useSettingsStore.getInitialState());
    localStorage.setItem("settings", saved);
    await useSettingsStore.persist.rehydrate();
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBe("high");
    expect(
      useSettingsStore.getState().modelRoles.utility.reasoningEffort,
    ).toBeUndefined();
  });

  it("does not apply thinking levels to speech roles", () => {
    const settings = useSettingsStore.getState();
    settings.setRoleModel("textToSpeech", thinkingModel);
    settings.setRoleReasoningEffort("textToSpeech", "high");
    expect(
      useSettingsStore.getState().modelRoles.textToSpeech.reasoningEffort,
    ).toBeUndefined();
  });
});
