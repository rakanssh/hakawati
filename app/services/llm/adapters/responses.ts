import type { ChatResponse, StreamChunk } from "../schema";
import type { ToolCall } from "../tools";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Request cancelled.", "AbortError");
}

/** SSE frames can span UTF-8 bytes, CRLF pairs, and multiple data lines. */
async function* events(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  options: ResponsesOptions,
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
      throw options.error(
        `${options.provider} returned an invalid streaming event.`,
        { code: "invalid_stream" },
      );
    }
  }
  try {
    while (true) {
      assertNotAborted(signal);
      const { value, done } = await reader.read();
      assertNotAborted(signal);
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

export interface ResponsesOptions {
  provider: string;
  namespace?: string;
  incompleteMessage?: string;
  error(message: string, details: unknown): Error;
}

export function responseChunks(
  response: Response,
  result: ChatResponse,
  signal: AbortSignal | undefined,
  options: ResponsesOptions,
): AsyncGenerator<StreamChunk> {
  if (!response.body)
    throw options.error(`${options.provider} returned no response stream.`, {
      code: "missing_stream",
    });
  return responseEvents(
    events(response.body, signal, options),
    result,
    signal,
    options,
  );
}

/** JSON responses use the same terminal-output validation as streaming responses. */
export async function readResponseJson(
  value: unknown,
  result: ChatResponse,
  signal: AbortSignal | undefined,
  options: ResponsesOptions,
): Promise<void> {
  const response = object(value);
  const type =
    response.status === "completed"
      ? "response.completed"
      : response.status === "incomplete"
        ? "response.incomplete"
        : "response.failed";
  async function* singleEvent() {
    yield { type, response };
  }
  for await (const chunk of responseEvents(
    singleEvent(),
    result,
    signal,
    options,
  )) {
    result.content += chunk.content ?? "";
    if (chunk.thinking)
      result.thinking = (result.thinking ?? "") + chunk.thinking;
  }
}

async function* responseEvents(
  source: AsyncIterable<JsonObject>,
  result: ChatResponse,
  signal: AbortSignal | undefined,
  options: ResponsesOptions,
): AsyncGenerator<StreamChunk> {
  const fail = (message: string, details: unknown): never => {
    throw options.error(message, details);
  };
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
      fail(`${options.provider} returned inconsistent response text.`, {
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
      (item.namespace !== undefined && item.namespace !== options.namespace)
    ) {
      return fail(`${options.provider} returned an invalid game tool call.`, {
        code: "invalid_tool_call",
      });
    }
    if (existing && (existing.id !== id || existing.function.name !== name)) {
      return fail(
        `${options.provider} changed a game tool call during the response.`,
        {
          code: "invalid_tool_call",
        },
      );
    }
    const previous = existing?.function.arguments ?? "";
    const args = string(item.arguments) ?? previous;
    if (!args.startsWith(previous))
      return fail(`${options.provider} returned inconsistent tool arguments.`, {
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

  for await (const event of source) {
    assertNotAborted(signal);
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
          fail(
            `${options.provider} returned tool arguments without a matching call.`,
            {
              code: "invalid_tool_call",
            },
          );
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
          fail(`${options.provider} finished an unknown tool call.`, {
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
        fail(`${options.provider} inference failed.`, event);
        break;
      case "response.failed":
        fail(`${options.provider} inference failed.`, object(event.response));
        break;
      case "response.incomplete":
        fail(
          options.incompleteMessage ??
            `${options.provider} did not complete the response. Increase the output token limit, lower the thinking level, or try a shorter request.`,
          { code: "response_incomplete", ...object(event.response) },
        );
        break;
      case "response.completed": {
        const completed = object(event.response);
        if (completed.status && completed.status !== "completed")
          fail(`${options.provider} did not complete the response.`, completed);
        const output = Array.isArray(completed.output) ? completed.output : [];
        for (const [outputIndex, item] of output.entries()) {
          for (const chunk of outputItem(outputIndex, object(item))) {
            assertNotAborted(signal);
            yield chunk;
          }
        }
        assertNotAborted(signal);
        for (const call of calls.values()) {
          try {
            const args: unknown = JSON.parse(call.function.arguments);
            if (!args || typeof args !== "object" || Array.isArray(args))
              throw new Error();
          } catch {
            fail(
              `${options.provider} returned incomplete or invalid game tool arguments.`,
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
      assertNotAborted(signal);
      yield chunk;
    }
  }
  assertNotAborted(signal);
  fail(
    `${options.provider} connection ended before the response completed. Retry the request.`,
    { code: "stream_interrupted" },
  );
}
