import { LLMClient, ChatRequest, ChatResponse, LLMModel } from "../schema";
import { parseOpenAIStream } from "../streaming";

export function OpenRouterClient(apiKey: string): LLMClient {
  const base = "https://openrouter.ai/api/v1";

  async function chat(
    req: ChatRequest,
    signal?: AbortSignal
  ): Promise<ChatResponse> {
    const body = JSON.stringify({
      ...req,
      messages: req.messages,
      stream: req.stream,
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
    const r = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const json = await r.json();
    return json.data.map((model: any) => ({
      id: model.id,
      name: model.name,
      contextLength: model.context_length,
    }));
  }
  return { chat, models };
}
