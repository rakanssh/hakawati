import { ResponseMode } from "@/types/api.type";
import {
  LLMClient,
  ChatRequest,
  ChatResponse,
  LLMModel,
  GM_RESPONSE_JSON_SCHEMA,
} from "../schema";
import { parseOpenAIStream } from "../streaming";
import { useSettingsStore } from "@/store/useSettingsStore";
export function OpenAiClient(apiKey?: string): LLMClient {
  const { openAiBaseUrl } = useSettingsStore.getState();
  const base = openAiBaseUrl;

  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const body = {
      model: req.model,
      messages: req.messages,
      stream: req.stream,
      max_tokens: req.max_tokens,
      options: Object.fromEntries(
        Object.entries(req.options ?? {}).filter(
          ([_, value]) => value !== undefined && value !== null,
        ),
      ),
      ...(req.responseMode === ResponseMode.RESPONSE_FORMAT && {
        response_mode: req.responseMode,
        response_format: {
          type: "json_schema",
          json_schema: GM_RESPONSE_JSON_SCHEMA,
        },
      }),
    };
    console.debug(`Sending request to ${req.model}:`, body);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const doFetch = () =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        if (req.stream) {
          return {
            content: "",
            iterator: parseOpenAIStream(r.body!),
            raw: r,
            // TODO: get usage from response
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          };
        } else {
          const json = await r.json();
          return {
            content: json.choices[0].message.content as string,
            raw: json,
            usage: json.usage,
          };
        }
      });

    return doFetch();
  }

  async function models(): Promise<LLMModel[]> {
    console.debug(`Fetching models from OpenAI`);
    const headers: HeadersInit = apiKey
      ? {
          Authorization: `Bearer ${apiKey}`,
        }
      : {};
    const r = await fetch(`${base}/models`, {
      headers,
    });
    if (!r.ok) {
      const errorText = await r.text().catch(() => "");
      throw new Error(errorText || `Failed to fetch models (${r.status})`);
    }
    const json = await r.json();
    console.log(json);
    // Allow providers that return minimal model info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : Array.isArray(json)
          ? json
          : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((model: any) => ({
      id: model.id ?? model.name,
      name: model.name ?? model.id ?? "unknown",
      contextLength: model.context_length ?? model.contextLength,
      pricing: model.pricing,
      supportsResponseFormat: Array.isArray(model.supported_parameters)
        ? model.supported_parameters.includes("response_format")
        : undefined,
    }));
  }
  return { chat, models };
}
