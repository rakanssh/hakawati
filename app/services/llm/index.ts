import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatRequest } from "./schema";

function getClient() {
  const apiKey = useSettingsStore.getState().apiKey?.trim();
  return OpenAiClient(apiKey || undefined);
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  return getClient().chat(req, signal);
}

export async function getModels(signal?: AbortSignal) {
  return getClient().models(signal);
}
