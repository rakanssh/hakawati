import { StreamChunk, ToolCallDelta } from "./schema";

const TEXT_VALUE_KEYS = ["text", "content", "output_text", "delta"] as const;

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

/**
 * Parse OpenAI streaming response and yield chunks containing content and/or tool_calls
 */
export async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const chunk = toStreamChunk(json);
        if (chunk) {
          yield chunk;
        }
      } catch {
        // ignore malformed partials; remaining bytes will arrive in subsequent chunks
      }
    }
  }

  // Flush any remaining buffered single line
  if (buffer.startsWith("data: ")) {
    const payload = buffer.slice(6).trim();
    if (payload !== "[DONE]") {
      try {
        const json = JSON.parse(payload);
        const chunk = toStreamChunk(json);
        if (chunk) {
          yield chunk;
        }
      } catch {
        // ignore
      }
    }
  }
}
