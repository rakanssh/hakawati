import { StreamChunk, ToolCallDelta } from "./schema";
import { assertNotAborted } from "./adapters/responses";

const TEXT_VALUE_KEYS = ["text", "content", "output_text", "delta"] as const;

// Long, since local servers read long prompts and some models think silently.
export const STREAM_START_TIMEOUT_MS = 5 * 60_000;
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

function collectTextFragments(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, out);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of TEXT_VALUE_KEYS) {
    if (key in obj) {
      collectTextFragments(obj[key], out);
    }
  }
}

function extractText(value: unknown): string {
  const fragments: string[] = [];
  collectTextFragments(value, fragments);
  return fragments.join("");
}

function toStreamChunk(json: unknown): StreamChunk | null {
  const delta = (json as { choices?: Array<{ delta?: unknown }> })?.choices?.[0]
    ?.delta;
  if (!delta || typeof delta !== "object") return null;

  const deltaObj = delta as Record<string, unknown>;
  const chunk: StreamChunk = {};

  const content = extractText(deltaObj.content);
  if (content) {
    chunk.content = content;
  }

  const thinking = [
    extractText(deltaObj.reasoning),
    extractText(deltaObj.reasoning_content),
    extractText(deltaObj.thinking),
  ]
    .filter((value) => value.length > 0)
    .join("");
  if (thinking) {
    chunk.thinking = thinking;
  }

  if (Array.isArray(deltaObj.tool_calls)) {
    chunk.tool_calls = deltaObj.tool_calls.map((tc) => {
      const tool = tc as ToolCallDelta;
      return {
        index: tool.index,
        id: tool.id,
        type: tool.type,
        function: tool.function
          ? {
              name: tool.function.name,
              arguments: tool.function.arguments,
            }
          : undefined,
      };
    });
  }

  if (chunk.content || chunk.thinking || chunk.tool_calls) {
    return chunk;
  }
  return null;
}

function parseDataLine(
  line: string,
): { chunk: StreamChunk | null; finishReason?: string } | "done" | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return "done";
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  const response = (json ?? {}) as {
    error?: { message?: string } | string;
    choices?: Array<{ finish_reason?: unknown }>;
  };
  if (response.error) {
    throw new Error(
      typeof response.error === "string"
        ? response.error
        : response.error.message ||
          "The provider could not complete the response.",
    );
  }
  const finishReason = response.choices?.[0]?.finish_reason;
  return {
    chunk: toStreamChunk(json),
    ...(typeof finishReason === "string" ? { finishReason } : {}),
  };
}

function assertFinishedNormally(
  finishReason: string,
  outputLimitAdjustable: boolean,
): void {
  if (finishReason === "length") {
    throw new Error(
      outputLimitAdjustable
        ? "The response reached its output token limit before finishing. Thinking and the answer share this limit. Increase Max Output Tokens or choose a lower thinking level and try again."
        : "The response reached its output token limit before finishing. Choose a lower Utility thinking level or use a shorter request and try again.",
    );
  }
  if (finishReason === "content_filter") {
    throw new Error(
      "The provider's content filter stopped the response. Retry, rephrase the turn, or choose another model.",
    );
  }
  if (finishReason === "error") {
    throw new Error("The provider could not complete the response.");
  }
}

async function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const minutes = Math.round(timeoutMs / 60_000);
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `The response stalled for ${minutes} minute${minutes === 1 ? "" : "s"}. Check your connection and retry.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
  options: { outputLimitAdjustable?: boolean; signal?: AbortSignal } = {},
): AsyncGenerator<StreamChunk> {
  const { signal } = options;
  const outputLimitAdjustable = options.outputLimitAdjustable !== false;
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  // A stalled body never settles a pending read, so Stop ends the read itself.
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", cancel, { once: true });
  let buffer = "";
  let started = false;
  let finished = false;

  try {
    while (true) {
      assertNotAborted(signal);
      const { done, value } = await readWithin(
        reader,
        started ? STREAM_IDLE_TIMEOUT_MS : STREAM_START_TIMEOUT_MS,
      );
      assertNotAborted(signal);
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const event = parseDataLine(line);
        if (event === "done") return;
        if (!event) continue;
        if (event.chunk) {
          started = true;
          yield event.chunk;
        }
        if (event.finishReason) {
          finished = true;
          assertFinishedNormally(event.finishReason, outputLimitAdjustable);
        }
      }
      if (done) break;
    }
    if (!finished) {
      throw new Error(
        "The connection ended before the response finished. Retry the request.",
      );
    }
  } catch (error) {
    assertNotAborted(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    // Breaking out of decoding must also stop the underlying HTTP response.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
