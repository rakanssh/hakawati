import { fetchChatGpt } from "@/services/chatgpt";
import { ResponseMode } from "@/types/api.type";
import type {
  ChatRequest,
  ChatResponse,
  LLMClient,
  LLMModel,
  StreamChunk,
} from "../schema";
import { GM_TOOLS, type ToolCall } from "../tools";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Keeps provider diagnostics available without logging requests or response bodies. */
export class ChatGptInferenceError extends Error {
  readonly code?: string;
  readonly param?: string;
  constructor(
    fallback: string,
    readonly details: unknown,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    const body = object(details);
    const error = object(body.error ?? body);
    const code = string(error.code);
    const recovery: Record<string, string> = {
      subscription_sharing_usage_limit_exceeded:
        "ChatGPT plan usage limit reached. Review your app usage in ChatGPT Settings → Usage, or choose another provider in Settings.",
      subscription_sharing_user_not_eligible:
        "ChatGPT plan usage is unavailable for this account or workspace. Choose another provider in Settings.",
      subscription_sharing_usage_unavailable:
        "ChatGPT usage is temporarily unavailable. Try again later; your connection is saved.",
      subscription_sharing_user_unavailable:
        "ChatGPT account information is temporarily unavailable. Try again later; your connection is saved.",
      subscription_sharing_unsupported_capability:
        "This ChatGPT model or request capability is not supported. Choose another model or adjust the request.",
      subscription_sharing_route_not_supported:
        "ChatGPT rejected the inference endpoint. Check the provider configuration.",
      subscription_sharing_invalid_user:
        "ChatGPT could not validate this account. Check the selected account and reconnect if necessary.",
      chatpass_v2_scope_not_authorized:
        "ChatGPT plan usage is not authorized. Enable it from the ChatGPT connection in Settings.",
      chatpass_v2_invalid_authorization_context:
        "ChatGPT plan usage authorization was rejected. Reconnect the ChatGPT account in Settings.",
    };
    const diagnostic = string(error.message) ?? string(body.detail);
    const message = (code && recovery[code]) || diagnostic || fallback;
    super(
      `${message}${code ? ` (${code})` : ""}${requestId ? ` [request ${requestId}]` : ""}`,
    );
    this.name = "ChatGptInferenceError";
    // Callers may log Error objects. Keep the original diagnostics available for
    // inspection without enumerating response bodies into those logs.
    Object.defineProperty(this, "details", { enumerable: false });
    this.code = code;
    this.param = string(error.param);
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  let details: unknown;
  try {
    details = JSON.parse(text);
  } catch {
    details = { detail: text };
  }
  throw new ChatGptInferenceError(
    `ChatGPT request failed (${response.status}). Check the selected account and plan usage permission.`,
    details,
    response.status,
    response.headers.get("x-request-id") ?? undefined,
  );
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("ChatGPT request cancelled.", "AbortError");
}

/** SSE frames can span UTF-8 bytes, CRLF pairs, and multiple data lines. */
async function* events(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<JsonObject> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  function dispatch(): JsonObject | undefined {
    if (!data.length) return;
    const payload = data.join("\n");
    data = [];
    if (payload === "[DONE]") return;
    try {
      const event = object(JSON.parse(payload));
      if (typeof event.type !== "string") throw new Error();
      return event;
    } catch {
      throw new ChatGptInferenceError(
        "ChatGPT returned an invalid streaming event.",
        { code: "invalid_stream" },
      );
    }
  }
  try {
    while (true) {
      aborted(signal);
      const { value, done } = await reader.read();
      aborted(signal);
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line === "") {
          const event = dispatch();
          if (event) yield event;
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (done) {
        if (buffer.startsWith("data:"))
          data.push(buffer.slice(5).replace(/^ /, "").replace(/\r$/, ""));
        const event = dispatch();
        if (event) yield event;
        return;
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function* responseChunks(
  response: Response,
  result: ChatResponse,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const fail = (message: string, details: unknown): never => {
    throw new ChatGptInferenceError(
      message,
      details,
      response.status,
      requestId,
    );
  };
  if (!response.body)
    fail("ChatGPT returned no response stream.", { code: "missing_stream" });
  const texts = new Map<string, string>();
  const calls = new Map<number, ToolCall>();

  function textChunk(
    key: string,
    value: unknown,
    thinking: boolean,
    final = false,
  ): StreamChunk[] {
    if (typeof value !== "string") return [];
    const previous = texts.get(key) ?? "";
    if (final && !value.startsWith(previous))
      fail("ChatGPT returned inconsistent response text.", {
        code: "invalid_stream",
      });
    const delta = final ? value.slice(previous.length) : value;
    texts.set(key, final ? value : previous + value);
    return delta ? [thinking ? { thinking: delta } : { content: delta }] : [];
  }

  function functionItem(index: number, item: JsonObject): StreamChunk[] {
    const existing = calls.get(index);
    const id = string(item.call_id);
    const name = string(item.name);
    if (
      !id ||
      !name ||
      (item.namespace !== undefined && item.namespace !== "hakawati")
    ) {
      return fail("ChatGPT returned an invalid game tool call.", {
        code: "invalid_tool_call",
      });
    }
    if (existing && (existing.id !== id || existing.function.name !== name)) {
      return fail("ChatGPT changed a game tool call during the response.", {
        code: "invalid_tool_call",
      });
    }
    const previous = existing?.function.arguments ?? "";
    const args = string(item.arguments) ?? previous;
    if (!args.startsWith(previous))
      return fail("ChatGPT returned inconsistent tool arguments.", {
        code: "invalid_tool_call",
      });
    calls.set(index, {
      id,
      type: "function",
      function: { name, arguments: args },
    });
    const delta = args.slice(previous.length);
    return !existing || delta
      ? [
          {
            tool_calls: [
              {
                index,
                ...(!existing ? { id, type: "function" as const } : {}),
                function: { ...(!existing ? { name } : {}), arguments: delta },
              },
            ],
          },
        ]
      : [];
  }

  function outputItem(index: number, item: JsonObject): StreamChunk[] {
    if (item.type === "function_call") return functionItem(index, item);
    const chunks: StreamChunk[] = [];
    const parts = Array.isArray(item.content) ? item.content : [];
    parts.forEach((value, contentIndex) => {
      const part = object(value);
      if (part.type === "output_text")
        chunks.push(
          ...textChunk(`${index}:text:${contentIndex}`, part.text, false, true),
        );
      if (part.type === "refusal")
        chunks.push(
          ...textChunk(
            `${index}:refusal:${contentIndex}`,
            part.refusal,
            false,
            true,
          ),
        );
      if (part.type === "reasoning_text")
        chunks.push(
          ...textChunk(
            `${index}:reasoning:${contentIndex}`,
            part.text,
            true,
            true,
          ),
        );
    });
    const summary = Array.isArray(item.summary) ? item.summary : [];
    summary.forEach((value, summaryIndex) => {
      chunks.push(
        ...textChunk(
          `${index}:summary:${summaryIndex}`,
          object(value).text,
          true,
          true,
        ),
      );
    });
    return chunks;
  }

  for await (const event of events(response.body!, signal)) {
    aborted(signal);
    const index =
      typeof event.output_index === "number" ? event.output_index : 0;
    const contentIndex =
      typeof event.content_index === "number" ? event.content_index : 0;
    const summaryIndex =
      typeof event.summary_index === "number" ? event.summary_index : 0;
    let chunks: StreamChunk[] = [];
    switch (event.type) {
      case "response.output_text.delta":
      case "response.output_text.done":
        chunks = textChunk(
          `${index}:text:${contentIndex}`,
          event.delta ?? event.text,
          false,
          event.type.endsWith(".done"),
        );
        break;
      case "response.refusal.delta":
      case "response.refusal.done":
        chunks = textChunk(
          `${index}:refusal:${contentIndex}`,
          event.delta ?? event.refusal,
          false,
          event.type.endsWith(".done"),
        );
        break;
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_summary_text.done":
        chunks = textChunk(
          `${index}:summary:${summaryIndex}`,
          event.delta ?? event.text,
          true,
          event.type.endsWith(".done"),
        );
        break;
      case "response.reasoning_text.delta":
      case "response.reasoning_text.done":
        chunks = textChunk(
          `${index}:reasoning:${contentIndex}`,
          event.delta ?? event.text,
          true,
          event.type.endsWith(".done"),
        );
        break;
      case "response.output_item.added":
        if (object(event.item).type === "function_call")
          chunks = functionItem(index, object(event.item));
        break;
      case "response.output_item.done":
        chunks = outputItem(index, object(event.item));
        break;
      case "response.function_call_arguments.delta": {
        const call = calls.get(index);
        if (!call || typeof event.delta !== "string")
          fail("ChatGPT returned tool arguments without a matching call.", {
            code: "invalid_tool_call",
          });
        call!.function.arguments += event.delta;
        chunks = [
          {
            tool_calls: [
              { index, function: { arguments: event.delta as string } },
            ],
          },
        ];
        break;
      }
      case "response.function_call_arguments.done": {
        const call = calls.get(index);
        if (!call)
          fail("ChatGPT finished an unknown tool call.", {
            code: "invalid_tool_call",
          });
        chunks = functionItem(index, {
          call_id: call!.id,
          name: call!.function.name,
          arguments: event.arguments,
        });
        break;
      }
      case "error":
        fail("ChatGPT inference failed.", event);
        break;
      case "response.failed":
        fail("ChatGPT inference failed.", object(event.response));
        break;
      case "response.incomplete":
        fail(
          "ChatGPT did not complete the response. Try a shorter request or another model.",
          { code: "response_incomplete", ...object(event.response) },
        );
        break;
      case "response.completed": {
        const completed = object(event.response);
        if (completed.status && completed.status !== "completed")
          fail("ChatGPT did not complete the response.", completed);
        const output = Array.isArray(completed.output) ? completed.output : [];
        for (const [outputIndex, item] of output.entries()) {
          for (const chunk of outputItem(outputIndex, object(item))) {
            aborted(signal);
            yield chunk;
          }
        }
        aborted(signal);
        for (const call of calls.values()) {
          try {
            const args: unknown = JSON.parse(call.function.arguments);
            if (!args || typeof args !== "object" || Array.isArray(args))
              throw new Error();
          } catch {
            fail(
              "ChatGPT returned incomplete or invalid game tool arguments.",
              {
                code: "invalid_tool_call",
              },
            );
          }
        }
        const usage = object(completed.usage);
        result.usage.prompt_tokens =
          typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
        result.usage.completion_tokens =
          typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
        result.usage.total_tokens =
          typeof usage.total_tokens === "number"
            ? usage.total_tokens
            : result.usage.prompt_tokens + result.usage.completion_tokens;
        if (calls.size)
          result.tool_calls = [...calls.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, call]) => call);
        return;
      }
    }
    for (const chunk of chunks) {
      aborted(signal);
      yield chunk;
    }
  }
  aborted(signal);
  fail(
    "ChatGPT connection ended before the response completed. Retry the request.",
    { code: "stream_interrupted" },
  );
}

/** A separate adapter keeps ChatGPT plan billing distinct from API-key providers. */
export function ChatGptClient(): LLMClient {
  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    aborted(signal);
    const body: JsonObject = {
      model: req.model,
      input: req.messages.map((message) => ({
        role: message.role === "system" ? "developer" : message.role,
        content: message.content,
      })),
      store: false,
      stream: true,
    };
    if (req.responseMode !== ResponseMode.FREE_FORM) {
      body.tools = [
        {
          type: "namespace",
          name: "hakawati",
          description:
            "Update player stats and inventory in the current adventure.",
          tools: GM_TOOLS.map((tool) => ({
            type: tool.type,
            ...tool.function,
          })),
        },
      ];
      body.tool_choice = "auto";
    }
    // This route rejects sampling/output limits; never spread generic options here.
    const response = await fetchChatGpt("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    await assertOk(response);
    const result: ChatResponse = {
      content: "",
      raw: undefined,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const iterator = responseChunks(response, result, signal);
    if (req.stream) {
      result.iterator = iterator;
    } else {
      for await (const chunk of iterator) {
        result.content += chunk.content ?? "";
        if (chunk.thinking)
          result.thinking = (result.thinking ?? "") + chunk.thinking;
      }
    }
    return result;
  }

  async function models(signal?: AbortSignal): Promise<LLMModel[]> {
    aborted(signal);
    const response = await fetchChatGpt("/models", { method: "GET", signal });
    await assertOk(response);
    const catalog = object(await response.json());
    aborted(signal);
    if (!Array.isArray(catalog.models))
      throw new ChatGptInferenceError(
        "ChatGPT returned an invalid model catalog. Reconnect or try again later.",
        { code: "invalid_model_catalog" },
      );
    return catalog.models.flatMap((value): LLMModel[] => {
      const model = object(value);
      if (
        model.visibility !== "list" ||
        typeof model.slug !== "string" ||
        !model.slug.trim()
      )
        return [];
      const context = model.context_length ?? model.context_window;
      const parameters = Array.isArray(model.supported_parameters)
        ? model.supported_parameters
        : undefined;
      return [
        {
          id: model.slug,
          name: string(model.display_name) || model.slug,
          ...(typeof context === "number" && context > 0
            ? { contextLength: context }
            : {}),
          ...(typeof model.supports_tool_calls === "boolean"
            ? { supportsToolCalls: model.supports_tool_calls }
            : parameters
              ? {
                  supportsToolCalls:
                    parameters.includes("tools") ||
                    parameters.includes("tool_choice"),
                }
              : {}),
        },
      ];
    });
  }

  async function unsupportedAudio(): Promise<never> {
    throw new Error(
      "ChatGPT plan usage does not support speech input or output. Select another provider for audio in Settings.",
    );
  }
  return {
    chat,
    models,
    transcribeAudio: unsupportedAudio,
    synthesizeSpeech: unsupportedAudio,
  };
}
