import { describe, expect, it, vi } from "vitest";
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
