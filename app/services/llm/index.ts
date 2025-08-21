import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatRequest, LLMClient } from "./schema";

let cachedClient: LLMClient | null = null;
let lastApiKey: string | undefined;
let unsubscribeApiKey: (() => void) | null = null;

export function getLLMClient(): LLMClient {
  const nextApiKey = useSettingsStore.getState().apiKey?.trim();

  if (!nextApiKey) {
    throw new Error("Missing API key");
  }

  if (!cachedClient || nextApiKey !== lastApiKey) {
    cachedClient = OpenAiClient(nextApiKey);
    lastApiKey = nextApiKey;
  }

  if (!unsubscribeApiKey) {
    type SettingsState = ReturnType<typeof useSettingsStore.getState>;
    unsubscribeApiKey = useSettingsStore.subscribe(
      (state: SettingsState, prevState: SettingsState) => {
        if (state.apiKey?.trim() !== prevState.apiKey?.trim()) {
          lastApiKey = state.apiKey?.trim();
          cachedClient = OpenAiClient(lastApiKey);
          console.debug("LLM client API key updated");
        }
      },
    );
  }

  return cachedClient;
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal) {
  const client = getLLMClient();
  return client.chat(req, signal);
}

export async function getModels() {
  const client = getLLMClient();
  return client.models();
}
