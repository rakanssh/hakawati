import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatRequest } from "./schema";

function getClient() {
  const apiKey = useSettingsStore.getState().apiKey?.trim();
  if (!apiKey) throw new Error("Missing API key");
  return OpenAiClient(apiKey);
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  return getClient().chat(req, signal);
}

export async function getModels() {
  return getClient().models();
}
