import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseMode } from "@/types/api.type";
import type { ChatRequest, StreamChunk } from "../schema";
import { ChatGptClient, ChatGptInferenceError } from "./chatgpt";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/services/chatgpt", () => ({ fetchChatGpt: fetchMock }));

const request: ChatRequest = {
  model: "account-model",
  messages: [
    { role: "system", content: "Narrate the adventure." },
    { role: "user", content: "Earlier action" },
    { role: "assistant", content: "Earlier narration" },
    { role: "user", content: "Open the door" },
  ],
  responseMode: ResponseMode.FREE_FORM,
};

function event(type: string, fields: Record<string, unknown> = {}) {
  return { type, ...fields };
}
const completed = (output: unknown[] = []) =>
  event("response.completed", {
    response: {
      status: "completed",
      output,
      usage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
    },
  });

function sse(
  events: unknown[],
  options: { fragment?: boolean; suffix?: string } = {},
) {
  const raw =
    events
      .map(
        (value) =>
          `event: ${(value as { type: string }).type}\r\ndata: ${JSON.stringify(value)}\r\n\r\n`,
      )
      .join("") + (options.suffix ?? "");
  const bytes = new TextEncoder().encode(raw);
  const cancel = vi.fn();
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      const size = options.fragment ? 1 : bytes.length;
      controller.enqueue(bytes.slice(offset, offset + size));
      offset = Math.min(offset + size, bytes.length);
    },
    cancel,
  });
  return {
    response: new Response(stream, { headers: { "x-request-id": "req_123" } }),
    cancel,
  };
}

async function collect(iterator: AsyncGenerator<StreamChunk> | undefined) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of iterator!) chunks.push(chunk);
  return chunks;
}

describe("ChatGPT plan inference", () => {
  beforeEach(() => fetchMock.mockReset());

  it("sends full history as developer/user/assistant inputs and omits unsupported options", async () => {
    fetchMock.mockResolvedValue(sse([completed()]).response);
    await ChatGptClient().chat({
      ...request,
      max_tokens: 50,
      options: { temperature: 0.5, topP: 0.8, topK: 10 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/responses",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: "account-model",
      store: false,
      stream: true,
      input: request.messages.map((message) => ({
        ...message,
        role: message.role === "system" ? "developer" : message.role,
      })),
    });
  });

  it.each(["low", "high", "none"] as const)(
    "sends explicit %s thinking while preserving subscription restrictions",
    async (reasoningEffort) => {
      fetchMock.mockResolvedValue(sse([completed()]).response);
      await ChatGptClient().chat({
        ...request,
        reasoningEffort,
        max_tokens: 2048,
        options: { temperature: 0.4, seed: 7 },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.reasoning).toEqual({ effort: reasoningEffort });
      expect(body.stream).toBe(true);
      expect(body.store).toBe(false);
      expect(body.max_tokens).toBeUndefined();
      expect(body.max_output_tokens).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.seed).toBeUndefined();
    },
  );

  it("reads account reasoning levels in preference to known model fallbacks", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        models: [
          {
            slug: "gpt-5",
            visibility: "list",
            supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
            default_reasoning_level: "high",
          },
          {
            slug: "gpt-5.2",
            visibility: "list",
            supported_reasoning_levels: [],
          },
          {
            slug: "custom-reasoner",
            visibility: "list",
            reasoning: { supported_efforts: ["medium"] },
          },
        ],
      }),
    );
    const models = await ChatGptClient().models();
    expect(models[0].reasoning).toMatchObject({
      supportedEfforts: ["low", "high"],
      defaultEffort: "high",
    });
    expect(models[1].reasoning?.supportedEfforts).toEqual([]);
    expect(models[2].reasoning?.supportedEfforts).toEqual(["medium"]);
  });

  it("aggregates utility text, reasoning and token usage from fragmented UTF-8/CRLF SSE without duplicating final snapshots", async () => {
    const output = [
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "A thought" }],
      },
      { type: "message", content: [{ type: "output_text", text: "باب 🌙" }] },
    ];
    fetchMock.mockResolvedValue(
      sse(
        [
          event("response.reasoning_summary_text.delta", {
            output_index: 0,
            summary_index: 0,
            delta: "A thought",
          }),
          event("response.reasoning_summary_text.done", {
            output_index: 0,
            summary_index: 0,
            text: "A thought",
          }),
          event("response.output_text.delta", {
            output_index: 1,
            content_index: 0,
            delta: "باب ",
          }),
          event("response.output_text.delta", {
            output_index: 1,
            content_index: 0,
            delta: "🌙",
          }),
          event("response.output_text.done", {
            output_index: 1,
            content_index: 0,
            text: "باب 🌙",
          }),
          completed(output),
        ],
        { fragment: true },
      ).response,
    );
    const result = await ChatGptClient().chat({ ...request, stream: false });
    expect(result).toMatchObject({
      content: "باب 🌙",
      thinking: "A thought",
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
    });
    expect(result.iterator).toBeUndefined();
  });

  it("passes cancellation to the transport and yields narrator chunks as they arrive", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(
      sse([
        event("response.output_text.delta", {
          output_index: 0,
          delta: "First",
        }),
        event("response.output_text.delta", {
          output_index: 0,
          delta: " second",
        }),
        completed(),
      ]).response,
    );
    const result = await ChatGptClient().chat(
      { ...request, stream: true },
      controller.signal,
    );
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(await result.iterator!.next()).toEqual({
      done: false,
      value: { content: "First" },
    });
    expect(await result.iterator!.next()).toEqual({
      done: false,
      value: { content: " second" },
    });
    expect(await result.iterator!.next()).toEqual({
      done: true,
      value: undefined,
    });
    expect(result.usage.total_tokens).toBe(18);
  });

  it("namespaces GM tools and preserves interleaved call ids, names and arguments", async () => {
    const callA = {
      type: "function_call",
      id: "fc_a",
      namespace: "hakawati",
      call_id: "call_a",
      name: "modify_stat",
      arguments: "",
    };
    const callB = {
      type: "function_call",
      id: "fc_b",
      namespace: "hakawati",
      call_id: "call_b",
      name: "add_to_inventory",
      arguments: "",
    };
    fetchMock.mockResolvedValue(
      sse([
        event("response.output_item.added", { output_index: 0, item: callA }),
        event("response.output_item.added", { output_index: 1, item: callB }),
        event("response.function_call_arguments.delta", {
          output_index: 0,
          item_id: "fc_a",
          delta: '{"name":"HP",',
        }),
        event("response.function_call_arguments.delta", {
          output_index: 1,
          item_id: "fc_b",
          delta: '{"item":"Key"}',
        }),
        event("response.function_call_arguments.delta", {
          output_index: 0,
          item_id: "fc_a",
          delta: '"value":-1}',
        }),
        event("response.function_call_arguments.done", {
          output_index: 0,
          arguments: '{"name":"HP","value":-1}',
        }),
        event("response.output_item.done", {
          output_index: 1,
          item: { ...callB, arguments: '{"item":"Key"}' },
        }),
        completed([
          { ...callA, arguments: '{"name":"HP","value":-1}' },
          { ...callB, arguments: '{"item":"Key"}' },
        ]),
      ]).response,
    );
    const result = await ChatGptClient().chat({
      ...request,
      responseMode: ResponseMode.TOOL_CALLING,
      stream: true,
    });
    const chunks = await collect(result.iterator);
    const calls = new Map<
      number,
      { id?: string; name?: string; args: string }
    >();
    for (const chunk of chunks)
      for (const delta of chunk.tool_calls ?? []) {
        const call = calls.get(delta.index) ?? { args: "" };
        call.id ??= delta.id;
        call.name ??= delta.function?.name;
        call.args += delta.function?.arguments ?? "";
        calls.set(delta.index, call);
      }
    expect([...calls.values()]).toEqual([
      { id: "call_a", name: "modify_stat", args: '{"name":"HP","value":-1}' },
      { id: "call_b", name: "add_to_inventory", args: '{"item":"Key"}' },
    ]);
    expect(result.tool_calls?.map((call) => call.id)).toEqual([
      "call_a",
      "call_b",
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools[0]).toMatchObject({
      type: "namespace",
      name: "hakawati",
      tools: [
        { type: "function", name: "modify_stat", strict: true },
        { name: "add_to_inventory" },
        { name: "remove_from_inventory" },
      ],
    });
    expect(body.tools[0].tools[0].function).toBeUndefined();
  });

  it("surfaces refusals as content and supports completed-only output", async () => {
    fetchMock.mockResolvedValue(
      sse([
        event("response.refusal.delta", {
          output_index: 0,
          content_index: 0,
          delta: "Cannot comply.",
        }),
        event("response.refusal.done", {
          output_index: 0,
          content_index: 0,
          refusal: "Cannot comply.",
        }),
        completed([
          {
            type: "message",
            content: [
              { type: "refusal", refusal: "Cannot comply." },
              { type: "output_text", text: " Try something else." },
            ],
          },
        ]),
      ]).response,
    );
    expect((await ChatGptClient().chat(request)).content).toBe(
      "Cannot comply. Try something else.",
    );
  });

  it.each([
    [[], "stream_interrupted"],
    [
      [
        event("response.incomplete", {
          response: {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
          },
        }),
      ],
      "response_incomplete",
    ],
    [
      [
        event("response.failed", {
          response: {
            error: {
              code: "subscription_sharing_usage_limit_exceeded",
              param: "model",
            },
          },
        }),
      ],
      "subscription_sharing_usage_limit_exceeded",
    ],
    [
      [event("error", { code: "server_error", message: "Please retry" })],
      "server_error",
    ],
  ])(
    "never treats an incomplete/failed stream as successful (%s)",
    async (terminal, code) => {
      fetchMock.mockResolvedValue(
        sse(
          [
            event("response.output_text.delta", { delta: "Partial" }),
            ...terminal,
          ],
          { suffix: "data: [DONE]\n\n" },
        ).response,
      );
      const result = await ChatGptClient().chat({ ...request, stream: true });
      await expect(collect(result.iterator)).rejects.toMatchObject({
        name: "ChatGptInferenceError",
        code,
        requestId: "req_123",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("offers applicable recovery when subscription output is incomplete", async () => {
    fetchMock.mockResolvedValue(
      sse([
        event("response.incomplete", {
          response: {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
          },
        }),
      ]).response,
    );
    const error = await ChatGptClient()
      .chat(request)
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ChatGptInferenceError);
    expect((error as Error).message).toContain("Lower the thinking level");
    expect((error as Error).message).not.toContain(
      "Increase the output token limit",
    );
  });

  it("preserves structured errors and direct-admission detail bodies without retrying", async () => {
    const details = {
      error: {
        code: "subscription_sharing_usage_limit_exceeded",
        param: "model",
        message: "limited",
      },
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(details), {
        status: 429,
        headers: { "x-request-id": "req_limit" },
      }),
    );
    await expect(ChatGptClient().chat(request)).rejects.toMatchObject({
      code: details.error.code,
      status: 429,
      param: "model",
      details,
      requestId: "req_limit",
      message: expect.stringContaining("Settings → Usage"),
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Region unavailable" }), {
        status: 403,
      }),
    );
    await expect(ChatGptClient().chat(request)).rejects.toMatchObject({
      status: 403,
      message: "Region unavailable",
      details: { detail: "Region unavailable" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed SSE rather than dropping corrupted content", async () => {
    fetchMock.mockResolvedValue(new Response("data: {not json}\n\n"));
    await expect(ChatGptClient().chat(request)).rejects.toMatchObject({
      code: "invalid_stream",
    });
  });

  it("handles multi-line SSE data and a final event without a newline", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        'data: {"type":"response.output_text.delta",\n' +
          'data: "delta":"Hello"}\n\n' +
          `data: ${JSON.stringify(completed())}`,
      ),
    );
    expect((await ChatGptClient().chat(request)).content).toBe("Hello");
  });

  it("cancels a pending stream read on abort", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const result = await ChatGptClient().chat(
      { ...request, stream: true },
      controller.signal,
    );
    const pending = result.iterator!.next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the response when the consumer stops early", async () => {
    const source = sse(
      [event("response.output_text.delta", { delta: "Hello" }), completed()],
      { fragment: true },
    );
    fetchMock.mockResolvedValue(source.response);
    const result = await ChatGptClient().chat({ ...request, stream: true });
    await result.iterator!.next();
    await result.iterator!.return(undefined);
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not start a request after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      ChatGptClient().chat(request, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not declare completion after cancellation during a final output snapshot", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(
      sse([
        completed([
          {
            type: "message",
            content: [{ type: "output_text", text: "Final text" }],
          },
        ]),
      ]).response,
    );
    const result = await ChatGptClient().chat(
      { ...request, stream: true },
      controller.signal,
    );
    expect((await result.iterator!.next()).value).toEqual({
      content: "Final text",
    });
    controller.abort();
    await expect(result.iterator!.next()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(result.usage.total_tokens).toBe(0);
  });

  it("rejects a completed response with truncated game tool arguments", async () => {
    fetchMock.mockResolvedValue(
      sse([
        completed([
          {
            type: "function_call",
            call_id: "call_bad",
            name: "modify_stat",
            arguments: '{"name":',
          },
        ]),
      ]).response,
    );
    await expect(
      ChatGptClient().chat({
        ...request,
        responseMode: ResponseMode.TOOL_CALLING,
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
  });

  it("uses the account catalog order, visible slugs and available capability metadata", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        models: [
          {
            slug: "z-model",
            display_name: "First model",
            visibility: "list",
            context_window: 32000,
            supports_tool_calls: true,
          },
          { slug: "hidden", display_name: "Hidden", visibility: "hide" },
          {
            slug: "a-model",
            display_name: "Second model",
            visibility: "list",
            context_length: 16000,
            supports_tool_calls: false,
          },
          { slug: "simple", visibility: "list" },
          { display_name: "Invalid", visibility: "list" },
        ],
      }),
    );
    expect(await ChatGptClient().models()).toEqual([
      {
        id: "z-model",
        name: "First model",
        contextLength: 32000,
        supportsToolCalls: true,
      },
      {
        id: "a-model",
        name: "Second model",
        contextLength: 16000,
        supportsToolCalls: false,
      },
      { id: "simple", name: "simple" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/models", {
      method: "GET",
      signal: undefined,
    });
  });

  it("rejects invalid catalogs and explicitly rejects audio without sending a request", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }));
    await expect(ChatGptClient().models()).rejects.toBeInstanceOf(
      ChatGptInferenceError,
    );
    const client = ChatGptClient();
    await expect(
      client.transcribeAudio({ model: "audio", file: new Blob() }),
    ).rejects.toThrow("does not support speech");
    await expect(
      client.synthesizeSpeech({
        model: "audio",
        input: "Hello",
        voice: "alloy",
      }),
    ).rejects.toThrow("does not support speech");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
