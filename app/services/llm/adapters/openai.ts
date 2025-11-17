import { ResponseMode } from "@/types/api.type";
import { LLMClient, ChatRequest, ChatResponse, LLMModel } from "../schema";
import { parseOpenAIStream } from "../streaming";
import { useSettingsStore } from "@/store/useSettingsStore";
import { fetch } from "@tauri-apps/plugin-http";
import { GM_TOOLS, ToolCall } from "../tools";
export function OpenAiClient(apiKey?: string): LLMClient {
  const { openAiBaseUrl } = useSettingsStore.getState();
  const base = openAiBaseUrl;

  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const useToolCalling = req.responseMode !== ResponseMode.FREE_FORM;

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream: req.stream,
      max_tokens: req.max_tokens,
      ...Object.fromEntries(
        Object.entries(req.options ?? {}).filter(
          ([_, value]) => value !== undefined && value !== null,
        ),
      ),
    };

    if (useToolCalling) {
      body.tools = GM_TOOLS;
      body.tool_choice = "auto";
    }

    console.debug(`Sending request to ${req.model}:`, body);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
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
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          };
        } else {
          const json = await r.json();
          const message = json.choices[0].message;
          const response: ChatResponse = {
            content: message.content || "",
            raw: json,
            usage: json.usage,
          };

          if (message.tool_calls && Array.isArray(message.tool_calls)) {
            response.tool_calls = message.tool_calls.map((tc: ToolCall) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }));
          }

          return response;
        }
      });

    return doFetch();
  }

  async function models(signal?: AbortSignal): Promise<LLMModel[]> {
    console.debug(`Fetching models from ${base}/models`);
    const headers: HeadersInit = {
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
    const r = await fetch(`${base}/models`, {
      method: "GET",
      headers,
      signal,
    });
    if (!r.ok) {
      const errorText = await r.text().catch(() => "");
      console.error(`Models fetch failed (${r.status}):`, errorText);
      console.error("Request URL:", `${base}/models`);
      console.error("Request headers:", headers);
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
    return data.map((model: any) => {
      const supportedParameters = Array.isArray(model.supported_parameters)
        ? (model.supported_parameters as string[])
        : undefined;

      const supportsToolCalls = supportedParameters
        ? supportedParameters.some((param) =>
            ["tools", "tool_choice", "tool_calls", "function_call"].includes(
              param,
            ),
          )
        : undefined;

      return {
        id: model.id ?? model.name,
        name: model.name ?? model.id ?? "unknown",
        contextLength: model.context_length ?? model.contextLength,
        pricing: model.pricing,
        supportsResponseFormat:
          supportedParameters?.includes("response_format"),
        supportsToolCalls,
      } satisfies LLMModel;
    });
  }
  return { chat, models };
}
