import { DEFAULT_TTS_VOICE, useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatGptClient } from "./adapters/chatgpt";
import { ChatRequest, LLMModel } from "./schema";
import {
  ApiConnection,
  ApiPreset,
  ApiType,
  ModelRole,
  ModelRoleSettings,
} from "@/types";
import { connectionBaseUrl } from "@/data/api-presets";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "./reasoning";
import { splitSpeechInput } from "./speechInput";

export class ModelRoleConfigurationError extends Error {
  constructor(
    public readonly role: ModelRole,
    message: string,
  ) {
    super(message);
    this.name = "ModelRoleConfigurationError";
  }
}

export interface ResolvedModelRole {
  role: ModelRole;
  config: ModelRoleSettings;
  model: LLMModel;
}

function getRoleConfig(role: ModelRole): ModelRoleSettings {
  return useSettingsStore.getState().modelRoles[role];
}

function assertRoleConfig(role: ModelRole): ModelRoleSettings {
  const config = getRoleConfig(role);
  if (config?.activePreset === ApiPreset.CHATGPT) {
    if (role === "speechToText" || role === "textToSpeech") {
      throw new ModelRoleConfigurationError(
        role,
        "ChatGPT plan usage supports narrator and utility models. Choose another provider for speech.",
      );
    }
    return config;
  }
  if (!config?.baseUrl?.trim()) {
    throw new ModelRoleConfigurationError(
      role,
      `No ${role} API URL configured. Choose a provider in Settings.`,
    );
  }
  if (config.apiType !== ApiType.OPENAI) {
    throw new ModelRoleConfigurationError(
      role,
      `Unsupported ${role} API type: ${config.apiType}.`,
    );
  }

  return config;
}

function getClient(role: ModelRole) {
  const config = assertRoleConfig(role);
  if (config.activePreset === ApiPreset.CHATGPT) return ChatGptClient();
  return OpenAiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey || undefined,
    model: config.model,
    role,
  });
}

export function resolveModelRole(role: ModelRole): ResolvedModelRole {
  const config = assertRoleConfig(role);
  if (!config.model) {
    throw new ModelRoleConfigurationError(
      role,
      `No ${role} model selected. Choose one in Settings.`,
    );
  }
  return { role, config, model: config.model };
}

export async function sendRoleChat(
  role: ModelRole,
  req: ChatRequest,
  signal?: AbortSignal,
) {
  const config = assertRoleConfig(role);
  const reasoning = getModelReasoning(
    config.model?.id === req.model ? config.model : undefined,
    reasoningProvider(
      config.baseUrl,
      config.activePreset === ApiPreset.CHATGPT,
    ),
  );
  const requested = req.reasoningEffort ?? config.reasoningEffort;
  const reasoningEffort = normalizeReasoningEffort(requested, reasoning);
  if (requested !== undefined && reasoningEffort === undefined) {
    throw new ModelRoleConfigurationError(
      role,
      "The selected thinking level is unavailable for this model. Choose Model default or a supported level in AI Setup.",
    );
  }
  return getClient(role).chat({ ...req, reasoningEffort }, signal);
}

export async function getRoleModels(role: ModelRole, signal?: AbortSignal) {
  return getClient(role).models(signal);
}

/** The chat models a connection offers, whichever roles use it. */
export async function getConnectionModels(
  connection: ApiConnection,
  signal?: AbortSignal,
) {
  const client =
    connection.preset === ApiPreset.CHATGPT
      ? ChatGptClient()
      : OpenAiClient({
          baseUrl: connectionBaseUrl(connection),
          apiKey: connection.apiKey || undefined,
        });
  return client.models(signal);
}

export async function transcribeSpeech(audio: Blob, signal?: AbortSignal) {
  const { model } = resolveModelRole("speechToText");
  return getClient("speechToText").transcribeAudio(
    {
      model: model.id,
      file: audio,
      filename: "speech.wav",
      response_format: "json",
    },
    signal,
  );
}

function resolveTextToSpeechVoice(config: ModelRoleSettings): string {
  const voice = (config.voice ?? DEFAULT_TTS_VOICE).trim();
  if (!voice) {
    throw new ModelRoleConfigurationError(
      "textToSpeech",
      "No textToSpeech voice configured. Enter a voice in Settings.",
    );
  }
  return voice;
}

export function getNarrationCacheKey(text: string) {
  const { config, model } = resolveModelRole("textToSpeech");
  return JSON.stringify({
    text,
    baseUrl: config.baseUrl.trim(),
    model: model.id,
    voice: resolveTextToSpeechVoice(config),
    responseFormat: "mp3",
  });
}

/**
 * Speaks the text and returns its audio in order. Text longer than the speech
 * endpoint accepts is sent in parts, one request each.
 */
export async function synthesizeNarration(
  text: string,
  signal?: AbortSignal,
): Promise<Blob[]> {
  const parts = splitSpeechInput(text);
  if (parts.length === 0) {
    throw new Error("No narration text provided.");
  }

  const { config, model } = resolveModelRole("textToSpeech");
  const voice = resolveTextToSpeechVoice(config);
  const client = getClient("textToSpeech");
  const audio: Blob[] = [];
  for (const input of parts) {
    const speech = await client.synthesizeSpeech(
      { model: model.id, input, voice, response_format: "mp3" },
      signal,
    );
    audio.push(speech.audio);
  }
  return audio;
}
