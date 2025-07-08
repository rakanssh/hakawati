import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenRouterClient } from "./adapters/openrouter";
import { ChatRequest, LLMClient } from "./schema";

let cachedClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  const { apiKey } = useSettingsStore.getState();
  console.debug(`Initializing LLM client with API key: ${apiKey}`);
  if (cachedClient) return cachedClient;

  cachedClient = OpenRouterClient(apiKey);

  useSettingsStore.subscribe((state) => {
    if (state.apiKey !== apiKey) {
      cachedClient = OpenRouterClient(state.apiKey);
      console.debug(`Updated LLM client with new API key: ${state.apiKey}`);
    }
  });

  return cachedClient;
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  const client = getLLMClient();
  return client.chat(req, signal);
}
