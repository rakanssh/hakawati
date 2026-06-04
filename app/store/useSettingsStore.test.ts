import { describe, expect, it, vi } from "vitest";
import { ApiPreset, MODEL_ROLES } from "@/types";
import type { LLMModel } from "@/services/llm/schema";
import {
  DEFAULT_TTS_VOICE,
  isModelRoleConfigured,
  migrateSettingsState,
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

  it("creates persisted schema slots for future speech roles", () => {
    const migrated = migrateSettingsState({});

    expect(Object.keys(migrated.modelRoles).sort()).toEqual(
      [...MODEL_ROLES].sort(),
    );
    expect(migrated.modelRoles.speechToText).toBeDefined();
    expect(migrated.modelRoles.textToSpeech).toBeDefined();
    expect(migrated.modelRoles.textToSpeech.voice).toBe(DEFAULT_TTS_VOICE);
    expect(migrated.autoNarrate).toBe(false);
  });
});
