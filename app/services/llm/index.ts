import { useSettingsStore } from "@/store/useSettingsStore";
import { OpenAiClient } from "./adapters/openai";
import { ChatRequest, LLMClient } from "./schema";

let cachedClient: LLMClient | null = null;
let lastApiKey: string | undefined;
let lastBaseUrl: string | undefined;
let unsubscribeSettings: (() => void) | null = null;

export function getLLMClient(): LLMClient {
  const nextApiKey = useSettingsStore.getState().apiKey?.trim();
  const nextBaseUrl = useSettingsStore.getState().openAiBaseUrl?.trim();

  if (!nextApiKey) {
    throw new Error("Missing API key");
  }

  if (
    !cachedClient ||
    nextApiKey !== lastApiKey ||
    nextBaseUrl !== lastBaseUrl
  ) {
    cachedClient = OpenAiClient(nextApiKey);
    lastApiKey = nextApiKey;
    lastBaseUrl = nextBaseUrl;
  }

  if (!unsubscribeSettings) {
    type SettingsState = ReturnType<typeof useSettingsStore.getState>;
    unsubscribeSettings = useSettingsStore.subscribe(
      (state: SettingsState, prevState: SettingsState) => {
        const apiKeyChanged = state.apiKey?.trim() !== prevState.apiKey?.trim();
        const baseUrlChanged =
          state.openAiBaseUrl?.trim() !== prevState.openAiBaseUrl?.trim();
        if (apiKeyChanged || baseUrlChanged) {
          lastApiKey = state.apiKey?.trim();
          lastBaseUrl = state.openAiBaseUrl?.trim();
          cachedClient = OpenAiClient(lastApiKey);
          console.debug(
            `LLM client settings updated (${apiKeyChanged ? "apiKey" : ""}${
              apiKeyChanged && baseUrlChanged ? ", " : ""
            }${baseUrlChanged ? "baseUrl" : ""})`,
          );
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
