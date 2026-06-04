import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseMode } from "@/types";
import type { LLMModel } from "./schema";
import {
  createDefaultModelRoles,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { generateScenario } from "./scenarioGenerator";
import { getRoleModels, sendRoleChat, transcribeSpeech } from ".";

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

const speechToTextModel: LLMModel = {
  id: "whisper-model",
  name: "Whisper Model",
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
  modelRoles.speechToText = {
    ...modelRoles.speechToText,
    baseUrl: "https://speech.example/v1",
    apiKey: "speech-key",
    model: speechToTextModel,
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

  it("fetches OpenRouter speech-to-text models with the transcription modality filter", async () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.speechToText = {
      ...modelRoles.speechToText,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "openrouter-key",
      model: speechToTextModel,
    };
    useSettingsStore.setState({ modelRoles });
    fetchMock.mockResolvedValue(
      responseJson({
        data: [{ id: "openai/whisper-1", name: "OpenAI: Whisper" }],
      }),
    );

    const models = await getRoleModels("speechToText");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=transcription",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer openrouter-key",
        }),
      }),
    );
    expect(models[0]).toMatchObject({
      id: "openai/whisper-1",
      name: "OpenAI: Whisper",
    });
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

  it("sends transcription requests to the speech-to-text endpoint", async () => {
    fetchMock.mockResolvedValue(responseJson({ text: "open the door" }));

    const result = await transcribeSpeech(
      new Blob(["audio"], { type: "audio/webm" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://speech.example/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer speech-key",
        }),
      }),
    );

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("model")).toBe("whisper-model");
    expect(body.get("response_format")).toBe("json");
    expect(body.get("file")).toBeInstanceOf(Blob);
    expect(result.text).toBe("open the door");
  });

  it("sends OpenRouter transcription requests as base64 JSON", async () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.speechToText = {
      ...modelRoles.speechToText,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "openrouter-key",
      model: { id: "openai/whisper-large-v3", name: "Whisper Large V3" },
    };
    useSettingsStore.setState({ modelRoles });
    fetchMock.mockResolvedValue(responseJson({ text: "speak friend" }));

    const result = await transcribeSpeech(
      new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openrouter-key",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      model: "openai/whisper-large-v3",
      input_audio: {
        data: "YXVkaW8=",
        format: "webm",
      },
    });
    expect(result.text).toBe("speak friend");
  });

  it("rejects transcription when the speech-to-text role is missing", async () => {
    const modelRoles = createDefaultModelRoles();
    modelRoles.narrator = {
      ...modelRoles.narrator,
      baseUrl: "https://narrator.example/v1",
      apiKey: "narrator-key",
      model: narratorModel,
    };
    useSettingsStore.setState({ modelRoles });

    await expect(
      transcribeSpeech(new Blob(["audio"], { type: "audio/webm" })),
    ).rejects.toThrow(/speechToText API URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty transcription responses", async () => {
    fetchMock.mockResolvedValue(responseJson({ text: "   " }));

    await expect(
      transcribeSpeech(new Blob(["audio"], { type: "audio/webm" })),
    ).rejects.toThrow(/no text/i);
  });
});
