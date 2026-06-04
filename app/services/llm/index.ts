import { DEFAULT_TTS_VOICE, useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatRequest, LLMModel } from "./schema";
import { ApiType, ModelRole, ModelRoleSettings } from "@/types";

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
  return OpenAiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey || undefined,
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
  return getClient(role).chat(req, signal);
}

export async function getRoleModels(role: ModelRole, signal?: AbortSignal) {
  return getClient(role).models(signal);
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

export async function synthesizeNarration(text: string, signal?: AbortSignal) {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("No narration text provided.");
  }

  const { config, model } = resolveModelRole("textToSpeech");
  return getClient("textToSpeech").synthesizeSpeech(
    {
      model: model.id,
      input: cleanText,
      voice: resolveTextToSpeechVoice(config),
      response_format: "mp3",
    },
    signal,
  );
}
