import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenRouterClient } from "./adapters/openrouter";
import { ChatRequest, LLMClient } from "./schema";

let cachedClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  const { apiKey } = useSettingsStore.getState();

  if (cachedClient) return cachedClient;

  cachedClient = OpenRouterClient(apiKey);
  return cachedClient;
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  const client = getLLMClient();
  return client.chat(req, signal);
}
