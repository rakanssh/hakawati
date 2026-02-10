import { describe, expect, it } from "vitest";
import { parseOpenAIStream } from "./streaming";
import { PlainTextDecoder, ToolCallingDecoder } from "./decoders";
import { StreamChunk } from "./schema";

function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = `${lines.join("\n")}\n`;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

async function collect<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const chunk of iterator) {
    out.push(chunk);
  }
  return out;
}

describe("parseOpenAIStream", () => {
  it("extracts story and thinking deltas from SSE", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      'data: {"choices":[{"delta":{"reasoning":"Plan: "}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"check surroundings"}}]}',
      "data: [DONE]",
    ]);

    const chunks = await collect(parseOpenAIStream(stream));

    expect(chunks).toEqual([
      { content: "Hello " },
      { thinking: "Plan: " },
      { thinking: "check surroundings" },
    ]);
  });

  it("extracts text from structured content arrays", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"A"}]}}]}',
      'data: {"choices":[{"delta":{"reasoning":[{"type":"reasoning","text":"B"}]}}]}',
      "data: [DONE]",
    ]);

    const chunks = await collect(parseOpenAIStream(stream));

    expect(chunks).toEqual([{ content: "A" }, { thinking: "B" }]);
  });

  it("does not leak reasoning fields into story extraction", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"A","reasoning":"leak"}]}}]}',
      "data: [DONE]",
    ]);

    const chunks = await collect(parseOpenAIStream(stream));

    expect(chunks).toEqual([{ content: "A" }]);
  });

  it("merges multiple thinking fields from a single delta", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"reasoning":"Plan: ","reasoning_content":"check"}}]}',
      "data: [DONE]",
    ]);

    const chunks = await collect(parseOpenAIStream(stream));

    expect(chunks).toEqual([{ thinking: "Plan: check" }]);
  });
});

describe("decoders", () => {
  it("PlainTextDecoder decodes escaped story and thinking chunks", async () => {
    const decoder = new PlainTextDecoder();
    async function* input(): AsyncGenerator<StreamChunk> {
      yield { content: "Line 1\\n", thinking: "Thought\\n" };
      yield { content: "Line 2", thinking: "next" };
    }

    const chunks = await collect(decoder.decode(input()));

    expect(chunks).toEqual([
      { story: "Line 1\n" },
      { thinking: "Thought\n" },
      { story: "Line 2" },
      { thinking: "next" },
    ]);
  });

  it("ToolCallingDecoder forwards thinking and produces actions", async () => {
    const decoder = new ToolCallingDecoder();
    async function* input(): AsyncGenerator<StreamChunk> {
      yield {
        content: "Narration",
        thinking: "internal plan",
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "modify_stat" },
          },
        ],
      };
      yield {
        tool_calls: [
          {
            index: 0,
            function: { arguments: '{"name":"HP","value":-5}' },
          },
        ],
      };
    }

    const chunks = await collect(decoder.decode(input()));

    expect(chunks).toEqual([
      { story: "Narration" },
      { thinking: "internal plan" },
      {
        actions: [{ type: "MODIFY_STAT", payload: { name: "HP", value: -5 } }],
      },
    ]);
  });
});
