import { LLMClient, ChatRequest, ChatResponse } from "../schema";
import { parseOpenAIStream } from "../streaming";
import { withRetry } from "../retry";

export function OpenRouterClient(apiKey: string): LLMClient {
  const base = "https://openrouter.ai/api/v1/chat/completions";

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
    console.debug("OpenRouterClient");
    console.debug(base);
    console.debug(body);
    console.debug(headers);

    const doFetch = () =>
      fetch(base, { method: "POST", headers, body, signal }).then(async (r) => {
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

    return withRetry(doFetch); // 429 / 502 back-off handling
  }

  return { chat };
}
