import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseOpenAIStream,
  STREAM_IDLE_TIMEOUT_MS,
  STREAM_START_TIMEOUT_MS,
} from "./streaming";
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

function makeStalledStream(lines: string[] = []) {
  const cancel = vi.fn();
  let send!: (line: string) => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = (line) => controller.enqueue(new TextEncoder().encode(line));
      for (const line of lines) send(`${line}\n`);
    },
    cancel,
  });
  return { stream, cancel, send: (line: string) => send(`${line}\n`) };
}

function trackSettled(promise: Promise<unknown>) {
  const state = { settled: false };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseOpenAIStream", () => {
  it("reports an exhausted thinking/output budget instead of accepting an empty answer", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"reasoning":"Planning"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
      "data: [DONE]",
    ]);
    const iterator = parseOpenAIStream(stream);
    expect((await iterator.next()).value).toEqual({ thinking: "Planning" });
    await expect(iterator.next()).rejects.toThrow("Increase Max Output Tokens");
    expect(stream.locked).toBe(false);
  });

  it("surfaces provider routing errors sent inside a successful HTTP stream", async () => {
    const stream = makeSseStream([
      'data: {"error":{"message":"No provider supports the selected reasoning effort"}}',
    ]);
    await expect(collect(parseOpenAIStream(stream))).rejects.toThrow(
      "No provider supports",
    );
    expect(stream.locked).toBe(false);
  });

  it("gives actionable budget advice for Utility's separate fixed output limit", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    ]);
    await expect(
      collect(parseOpenAIStream(stream, { outputLimitAdjustable: false })),
    ).rejects.toThrow("lower Utility thinking level");
  });

  it("accepts SSE data fields without a space and releases the reader at completion", async () => {
    const stream = makeSseStream([
      'data:{"choices":[{"delta":{"content":"Hello"}}]}',
      "data:[DONE]",
    ]);
    expect(await collect(parseOpenAIStream(stream))).toEqual([
      { content: "Hello" },
    ]);
    expect(stream.locked).toBe(false);
  });

  it("cancels and unlocks the HTTP body when the consumer stops early", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Partial"}}]}\n',
          ),
        );
      },
      cancel,
    });
    const iterator = parseOpenAIStream(stream);
    expect((await iterator.next()).value).toEqual({ content: "Partial" });
    await iterator.return(undefined);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("releases the reader when the network stream fails", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("Connection lost"));
      },
    });
    await expect(collect(parseOpenAIStream(stream))).rejects.toThrow(
      "Connection lost",
    );
    expect(stream.locked).toBe(false);
  });

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

  it("ends a stalled read when the reply is stopped", async () => {
    const controller = new AbortController();
    const { stream, cancel } = makeStalledStream([
      'data: {"choices":[{"delta":{"content":"The door"}}]}',
    ]);
    const iterator = parseOpenAIStream(stream, { signal: controller.signal });
    expect((await iterator.next()).value).toEqual({ content: "The door" });

    const pending = iterator.next();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("reports an error stream after Stop as stopped", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(source) {
        controller.signal.addEventListener("abort", () =>
          source.error("Request cancelled"),
        );
      },
    });
    const pending = parseOpenAIStream(stream, {
      signal: controller.signal,
    }).next();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("ends a reply that stops sending bytes partway", async () => {
    vi.useFakeTimers();
    const { stream, cancel } = makeStalledStream([
      'data: {"choices":[{"delta":{"content":"The door"}}]}',
    ]);
    const iterator = parseOpenAIStream(stream);
    expect((await iterator.next()).value).toEqual({ content: "The door" });

    const assertion = expect(iterator.next()).rejects.toThrow(
      "The response stalled for 1 minute",
    );
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS);

    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("waits longer for a reply to start than for one that is arriving", async () => {
    vi.useFakeTimers();
    const { stream } = makeStalledStream([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
    ]);
    const pending = parseOpenAIStream(stream).next();
    const state = trackSettled(pending);

    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS * 2);
    expect(state.settled).toBe(false);

    const assertion = expect(pending).rejects.toThrow(
      "The response stalled for 5 minutes",
    );
    await vi.advanceTimersByTimeAsync(STREAM_START_TIMEOUT_MS);
    await assertion;
  });

  it("keeps waiting while the provider sends keep-alive comments", async () => {
    vi.useFakeTimers();
    const { stream, send } = makeStalledStream([
      'data: {"choices":[{"delta":{"content":"The door"}}]}',
    ]);
    const iterator = parseOpenAIStream(stream);
    await iterator.next();
    const pending = iterator.next();
    const state = trackSettled(pending);

    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1_000);
    send(": keep-alive");
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1_000);
    expect(state.settled).toBe(false);

    send('data: {"choices":[{"delta":{"content":" opens."}}]}');
    expect((await pending).value).toEqual({ content: " opens." });
  });

  it("flags a reply the content filter stopped, after the text that came first", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":"The blade"},"finish_reason":"content_filter"}]}',
      "data: [DONE]",
    ]);
    const iterator = parseOpenAIStream(stream);

    expect((await iterator.next()).value).toEqual({ content: "The blade" });
    await expect(iterator.next()).rejects.toThrow("content filter");
    expect(stream.locked).toBe(false);
  });

  it("flags a stream that ends without [DONE] or a finish reason", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":"The door"}}]}',
    ]);
    const iterator = parseOpenAIStream(stream);

    expect((await iterator.next()).value).toEqual({ content: "The door" });
    await expect(iterator.next()).rejects.toThrow(
      "The connection ended before the response finished",
    );
  });

  it("accepts a stream that gives a finish reason without [DONE]", async () => {
    const stream = makeSseStream([
      'data: {"choices":[{"delta":{"content":"The door opens."}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    expect(await collect(parseOpenAIStream(stream))).toEqual([
      { content: "The door opens." },
    ]);
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
