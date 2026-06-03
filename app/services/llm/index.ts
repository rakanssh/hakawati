import { useSettingsStore } from "@/store/useSettingsStore";
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

function getClient(role: ModelRole) {
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
  return OpenAiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey || undefined,
  });
}

export function resolveModelRole(role: ModelRole): ResolvedModelRole {
  const config = getRoleConfig(role);
  if (!config?.baseUrl?.trim()) {
    throw new ModelRoleConfigurationError(
      role,
      `No ${role} API URL configured. Choose a provider in Settings.`,
    );
  }
  if (!config.model) {
    throw new ModelRoleConfigurationError(
      role,
      `No ${role} model selected. Choose one in Settings.`,
    );
  }
  if (config.apiType !== ApiType.OPENAI) {
    throw new ModelRoleConfigurationError(
      role,
      `Unsupported ${role} API type: ${config.apiType}.`,
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

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  return sendRoleChat("narrator", req, signal);
}

export async function getModels(signal?: AbortSignal) {
  return getRoleModels("narrator", signal);
}
