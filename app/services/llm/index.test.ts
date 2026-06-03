import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseMode } from "@/types";
import type { LLMModel } from "./schema";
import {
  createDefaultModelRoles,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { generateScenario } from "./scenarioGenerator";
import { getRoleModels, sendRoleChat } from ".";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: fetchMock,
}));

const narratorModel: LLMModel = {
  id: "narrator-model",
  name: "Narrator Model",
};

const utilityModel: LLMModel = {
  id: "utility-model",
  name: "Utility Model",
};

function responseJson(json: unknown) {
  return {
    ok: true,
    body: null,
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
}

function setConfiguredRoles() {
  const modelRoles = createDefaultModelRoles();
  modelRoles.narrator = {
    ...modelRoles.narrator,
    baseUrl: "https://narrator.example/v1",
    apiKey: "narrator-key",
    model: narratorModel,
  };
  modelRoles.utility = {
    ...modelRoles.utility,
    baseUrl: "https://utility.example/v1",
    apiKey: "utility-key",
    model: utilityModel,
  };
  useSettingsStore.setState({ modelRoles });
}

describe("role-aware LLM service", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setConfiguredRoles();
  });

  it("sends narrator chat requests to the narrator endpoint", async () => {
    fetchMock.mockResolvedValue(
      responseJson({
        choices: [{ message: { content: "narrated" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );

    await sendRoleChat("narrator", {
      model: narratorModel.id,
      messages: [{ role: "user", content: "Hello" }],
      responseMode: ResponseMode.FREE_FORM,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://narrator.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer narrator-key",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "narrator-model",
    });
  });

  it("fetches utility models from the utility endpoint", async () => {
    fetchMock.mockResolvedValue(
      responseJson({
        data: [{ id: "utility-a", name: "Utility A" }],
      }),
    );

    const models = await getRoleModels("utility");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://utility.example/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer utility-key",
        }),
      }),
    );
    expect(models[0]).toMatchObject({ id: "utility-a", name: "Utility A" });
  });

  it("rejects utility generation when the utility role is missing", async () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.narrator = {
      ...modelRoles.narrator,
      baseUrl: "https://narrator.example/v1",
      apiKey: "narrator-key",
      model: narratorModel,
    };
    useSettingsStore.setState({ modelRoles });

    await expect(generateScenario("make a desert mystery")).rejects.toThrow(
      /utility API URL/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
