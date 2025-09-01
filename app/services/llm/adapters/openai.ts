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
export function OpenAiClient(apiKey: string): LLMClient {
  const { openAiBaseUrl } = useSettingsStore.getState();
  const base = openAiBaseUrl;

  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const { options } = req;
    const body = JSON.stringify({
      ...req,
      messages: req.messages,
      stream: req.stream,
      ...(req.responseMode === ResponseMode.RESPONSE_FORMAT && {
        response_format: {
          type: "json_schema",
          json_schema: GM_RESPONSE_JSON_SCHEMA,
        },
      }),
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    const doFetch = () =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body,
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
            ...(options?.temperature && { temperature: options.temperature }),
            ...(options?.topP && { top_p: options.topP }),
            ...(options?.topK && { top_k: options.topK }),
            ...(options?.frequencyPenalty && {
              frequency_penalty: options.frequencyPenalty,
            }),
            ...(options?.presencePenalty && {
              presence_penalty: options.presencePenalty,
            }),
            ...(options?.repetitionPenalty && {
              repetition_penalty: options.repetitionPenalty,
            }),
            ...(options?.minP && { min_p: options.minP }),
            ...(options?.topA && { top_a: options.topA }),
            ...(options?.seed && { seed: options.seed }),
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
    const r = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const json = await r.json();
    console.log(json);
    // TODO: fix later
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return json.data.map((model: any) => ({
      id: model.id,
      name: model.name,
      contextLength: model.context_length,
      pricing: model.pricing,
      supportsResponseFormat: Array.isArray(model.supported_parameters)
        ? model.supported_parameters.includes("response_format")
        : undefined,
    }));
  }
  return { chat, models };
}
