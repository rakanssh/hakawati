import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseMode } from "@/types/api.type";
import type { ChatRequest, StreamChunk } from "../schema";
import { OpenAiClient } from "./openai";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

const request: ChatRequest = {
  model: "gpt-5",
  messages: [
    { role: "system", content: "Narrate the adventure." },
    { role: "assistant", content: "A door appears." },
    { role: "user", content: "Open it." },
  ],
  responseMode: ResponseMode.FREE_FORM,
};
const openai = () =>
  OpenAiClient({ baseUrl: "https://api.openai.com/v1/", apiKey: "test-key" });
const completed = (output: unknown[] = []) => ({
  status: "completed",
  output,
  usage: { input_tokens: 12, output_tokens: 9, total_tokens: 21 },
});
const message = (text = "A hall.") => ({
  type: "message",
  content: [{ type: "output_text", text }],
});
const call = {
  type: "function_call",
  call_id: "call_1",
  name: "modify_stat",
  arguments: '{"name":"HP","value":-1}',
};
const completion = (finish_reason = "stop") =>
  Response.json({
    choices: [{ finish_reason, message: { content: "A hall." } }],
    usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
  });
function sse(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "x-request-id": "req_api" } },
  );
}
async function collect(iterator: AsyncGenerator<StreamChunk> | undefined) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of iterator!) chunks.push(chunk);
  return chunks;
}

describe("thinking level provider adapters", () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([undefined, "high", "none"] as const)(
    "sends OpenRouter effort %s using reasoning and parameter-aware routing",
    async (reasoningEffort) => {
      fetchMock.mockResolvedValue(completion());
      const client = OpenAiClient({ baseUrl: "https://openrouter.ai/api/v1" });
      await client.chat({ ...request, reasoningEffort, max_tokens: 4096 });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBe(4096);
      expect(body.reasoning_effort).toBeUndefined();
      if (reasoningEffort) {
        expect(body.reasoning).toEqual({ effort: reasoningEffort });
        expect(body.provider).toEqual({ require_parameters: true });
      } else {
        expect(body.reasoning).toBeUndefined();
        expect(body.provider).toBeUndefined();
      }
    },
  );

  it("omits incidental unsupported samplers when requiring OpenRouter reasoning support", async () => {
    fetchMock.mockResolvedValue(completion());
    await OpenAiClient({
      baseUrl: "https://openrouter.ai/api/v1",
      model: {
        id: "gpt-5",
        name: "Reasoner",
        reasoning: { supportedEfforts: ["high"] },
        supportedParameters: ["reasoning", "tools"],
      },
    }).chat({
      ...request,
      reasoningEffort: "high",
      max_tokens: 4096,
      options: { seed: 42, temperature: 0.5, topP: 0.9 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      reasoning: { effort: "high" },
      provider: { require_parameters: true },
      max_tokens: 4096,
    });
    expect(body.seed).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.topP).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it("maps advertised OpenRouter sampler fields to their API parameter names", async () => {
    fetchMock.mockResolvedValue(completion());
    await OpenAiClient({
      baseUrl: "https://openrouter.ai/api/v1",
      model: {
        id: "gpt-5",
        name: "Reasoner",
        supportedParameters: [
          "reasoning",
          "top_p",
          "top_k",
          "frequency_penalty",
          "presence_penalty",
          "repetition_penalty",
          "min_p",
          "top_a",
          "temperature",
          "seed",
        ],
      },
    }).chat({
      ...request,
      reasoningEffort: "high",
      options: {
        topP: 0.9,
        topK: 30,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        repetitionPenalty: 1.1,
        minP: 0.1,
        topA: 0.2,
        temperature: 0.6,
        seed: 42,
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      top_p: 0.9,
      top_k: 30,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      repetition_penalty: 1.1,
      min_p: 0.1,
      top_a: 0.2,
      temperature: 0.6,
      seed: 42,
    });
  });

  it("keeps provider sampler defaults when strict effort routing lacks parameter metadata", async () => {
    fetchMock.mockResolvedValue(completion());
    await OpenAiClient({ baseUrl: "https://openrouter.ai/api/v1" }).chat({
      ...request,
      reasoningEffort: "high",
      options: { seed: 42, temperature: 0.5, topP: 0.9 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("seed");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("topP");
    expect(body).not.toHaveProperty("top_p");
  });

  it("keeps Responses for a known reasoning model with no adjustable catalog efforts", async () => {
    fetchMock.mockResolvedValue(Response.json(completed()));
    await OpenAiClient({
      baseUrl: "https://api.openai.com/v1",
      model: {
        id: "gpt-5",
        name: "Default-only reasoner",
        reasoning: { supportedEfforts: [] },
      },
    }).chat(request);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).reasoning,
    ).toBeUndefined();
  });

  it("preserves Chat Completions for custom compatible providers and sends their explicit reasoning_effort", async () => {
    fetchMock.mockResolvedValue(completion());
    await OpenAiClient({ baseUrl: "https://compatible.example/v1" }).chat({
      ...request,
      reasoningEffort: "low",
      options: { temperature: 0.6 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://compatible.example/v1/chat/completions",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      reasoning_effort: "low",
      temperature: 0.6,
    });
  });

  it("preserves the ordinary OpenAI Chat Completions path", async () => {
    fetchMock.mockResolvedValue(completion());
    await openai().chat({
      ...request,
      model: "gpt-4.1",
      options: { temperature: 0.6 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      temperature: 0.6,
    });
  });

  it.each([undefined, "high"] as const)(
    "routes direct OpenAI reasoning through Responses with effort %s and valid options",
    async (reasoningEffort) => {
      fetchMock.mockResolvedValue(Response.json(completed([message()])));
      const signal = new AbortController().signal;
      const result = await openai().chat(
        {
          ...request,
          reasoningEffort,
          max_tokens: 8192,
          options: {
            temperature: 0.8,
            topP: 0.9,
            seed: 42,
            frequencyPenalty: 0.3,
          },
        },
        signal,
      );
      expect(result).toMatchObject({
        content: "A hall.",
        usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/responses");
      expect(init.signal).toBe(signal);
      expect(init.headers.Authorization).toBe("Bearer test-key");
      expect(JSON.parse(init.body)).toEqual({
        model: "gpt-5",
        store: false,
        stream: false,
        max_output_tokens: 8192,
        input: request.messages.map((item) => ({
          ...item,
          role: item.role === "system" ? "developer" : item.role,
        })),
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      });
    },
  );

  it.each([
    ["gpt-5.1", undefined],
    ["gpt-5.2", undefined],
    ["gpt-5.4", undefined],
    ["gpt-5.1", "none"],
    ["gpt-5.2", "none"],
    ["gpt-5.4", "none"],
    ["gpt-5.5", "none"],
    ["gpt-5.6", "none"],
    ["gpt-6-sol", "none"],
    ["gpt-6-luna", "none"],
    ["gpt-5.2-2025-12-11", "none"],
  ] as const)(
    "preserves supported samplers for %s with effort %s",
    async (model, reasoningEffort) => {
      fetchMock.mockResolvedValue(Response.json(completed()));
      await openai().chat({
        ...request,
        model,
        reasoningEffort,
        options: {
          temperature: 0,
          topP: 0.8,
          seed: 42,
          frequencyPenalty: 0.3,
          topK: 10,
        },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.temperature).toBe(0);
      expect(body.top_p).toBe(0.8);
      expect(body.topP).toBeUndefined();
      expect(body.seed).toBeUndefined();
      expect(body.frequencyPenalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.topK).toBeUndefined();
      expect(body.top_k).toBeUndefined();
      expect(body.reasoning).toEqual(
        reasoningEffort ? { effort: reasoningEffort } : undefined,
      );
    },
  );

  it.each([
    ["gpt-5.1", "high"],
    ["gpt-5.2", "low"],
    ["gpt-5.4", "medium"],
    ["gpt-5.5", undefined],
    ["gpt-5.6", undefined],
    ["gpt-6-sol", undefined],
  ] as const)(
    "omits samplers when %s uses reasoning effort %s",
    async (model, reasoningEffort) => {
      fetchMock.mockResolvedValue(Response.json(completed()));
      await openai().chat({
        ...request,
        model,
        reasoningEffort,
        options: { temperature: 0.4, topP: 0.8, seed: 42 },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
      expect(body.seed).toBeUndefined();
    },
  );

  it("respects a known model's advertised default effort before its fallback default", async () => {
    fetchMock.mockResolvedValue(Response.json(completed()));
    await OpenAiClient({
      baseUrl: "https://api.openai.com/v1",
      model: {
        id: "gpt-5.2",
        name: "Account model",
        reasoning: {
          supportedEfforts: ["none", "high"],
          defaultEffort: "high",
        },
      },
    }).chat({
      ...request,
      model: "gpt-5.2",
      options: { temperature: 0.4, topP: 0.8 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it("does not infer sampler support from an unknown model's None metadata", async () => {
    fetchMock.mockResolvedValue(Response.json(completed()));
    await OpenAiClient({
      baseUrl: "https://api.openai.com/v1",
      model: {
        id: "future-model",
        name: "Future",
        reasoning: {
          supportedEfforts: ["none", "high"],
          defaultEffort: "none",
        },
      },
    }).chat({
      ...request,
      model: "future-model",
      options: { temperature: 0.4, topP: 0.8 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it("uses Responses at model default for a future model with catalog reasoning metadata", async () => {
    fetchMock.mockResolvedValue(Response.json(completed()));
    await OpenAiClient({
      baseUrl: "https://api.openai.com/v1",
      model: {
        id: "future-model",
        name: "Future",
        reasoning: { supportedEfforts: ["low", "high"] },
      },
    }).chat({ ...request, model: "future-model" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).reasoning,
    ).toBeUndefined();
  });

  it("maps public API function tools and aggregates nonstream text, summary, calls and usage", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        completed([
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "Consider the hall." }],
          },
          message(),
          call,
        ]),
      ),
    );
    const result = await openai().chat({
      ...request,
      responseMode: ResponseMode.TOOL_CALLING,
      reasoningEffort: "high",
    });
    expect(result).toMatchObject({
      content: "A hall.",
      thinking: "Consider the hall.",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "modify_stat", arguments: call.arguments },
        },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools[0]).toMatchObject({
      type: "function",
      name: "modify_stat",
      strict: true,
    });
    expect(body.tools[0].function).toBeUndefined();
    expect(body.tools[0].namespace).toBeUndefined();
    expect(body.tool_choice).toBe("auto");
  });

  it("streams reasoning, text and tool arguments without duplicating completed snapshots", async () => {
    fetchMock.mockResolvedValue(
      sse([
        {
          type: "response.reasoning_summary_text.delta",
          output_index: 0,
          delta: "Thinking",
        },
        {
          type: "response.output_text.delta",
          output_index: 1,
          delta: "A hall.",
        },
        {
          type: "response.output_item.added",
          output_index: 2,
          item: { ...call, arguments: "" },
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 2,
          delta: call.arguments,
        },
        {
          type: "response.completed",
          response: completed([
            { type: "reasoning", summary: [{ text: "Thinking" }] },
            message(),
            call,
          ]),
        },
      ]),
    );
    const result = await openai().chat({
      ...request,
      stream: true,
      responseMode: ResponseMode.TOOL_CALLING,
    });
    const chunks = await collect(result.iterator);
    expect(chunks.map((chunk) => chunk.content ?? "").join("")).toBe("A hall.");
    expect(chunks.map((chunk) => chunk.thinking ?? "").join("")).toBe(
      "Thinking",
    );
    expect(
      chunks
        .flatMap((chunk) => chunk.tool_calls ?? [])
        .map((delta) => delta.function?.arguments ?? "")
        .join(""),
    ).toBe(call.arguments);
    expect(result.tool_calls?.[0].id).toBe("call_1");
    expect(result.usage.total_tokens).toBe(21);
  });

  it.each([false, true])(
    "surfaces incomplete output with budget guidance (stream %s)",
    async (stream) => {
      const response = {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      };
      fetchMock.mockResolvedValue(
        stream
          ? sse([{ type: "response.incomplete", response }])
          : Response.json(response),
      );
      if (stream) {
        const result = await openai().chat({ ...request, stream });
        await expect(collect(result.iterator)).rejects.toThrow(
          "lower the thinking level",
        );
      } else
        await expect(openai().chat(request)).rejects.toThrow(
          "lower the thinking level",
        );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "suggests applicable Utility recovery for incomplete Responses (stream %s)",
    async (stream) => {
      const response = {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      };
      fetchMock.mockResolvedValue(
        stream
          ? sse([{ type: "response.incomplete", response }])
          : Response.json(response),
      );
      const client = OpenAiClient({
        baseUrl: "https://api.openai.com/v1",
        role: "utility",
      });
      const error = await (async () => {
        const result = await client.chat({ ...request, stream });
        if (stream) await collect(result.iterator);
      })().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Lower the Utility thinking level",
      );
      expect((error as Error).message).not.toContain("Increase");
    },
  );

  it.each([false, true])(
    "suggests applicable Utility recovery for truncated Chat Completions (stream %s)",
    async (stream) => {
      fetchMock.mockResolvedValue(
        stream
          ? sse([{ choices: [{ delta: {}, finish_reason: "length" }] }])
          : completion("length"),
      );
      const client = OpenAiClient({
        baseUrl: "https://openrouter.ai/api/v1",
        role: "utility",
      });
      const error = await (async () => {
        const result = await client.chat({ ...request, stream });
        if (stream) await collect(result.iterator);
      })().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message.toLowerCase()).toContain(
        "utility thinking level",
      );
      expect((error as Error).message).not.toContain("Increase");
    },
  );

  it("surfaces API errors without subscription recovery instructions or an automatic retry", async () => {
    fetchMock.mockResolvedValue(
      sse([
        {
          type: "response.failed",
          response: {
            error: {
              code: "rate_limit_exceeded",
              message: "API quota reached",
            },
          },
        },
      ]),
    );
    const result = await openai().chat({ ...request, stream: true });
    await expect(collect(result.iterator)).rejects.toThrow("API quota reached");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { message: "Unsupported effort" } },
        { status: 400 },
      ),
    );
    await expect(openai().chat(request)).rejects.toThrow("Unsupported effort");
  });

  it("rejects truncated and malformed Responses streams", async () => {
    fetchMock.mockResolvedValue(
      sse([{ type: "response.output_text.delta", delta: "Partial" }]),
    );
    const partial = await openai().chat({ ...request, stream: true });
    await expect(collect(partial.iterator)).rejects.toThrow(
      "ended before the response completed",
    );
    fetchMock.mockResolvedValue(new Response("data: invalid\n\n"));
    const malformed = await openai().chat({ ...request, stream: true });
    await expect(collect(malformed.iterator)).rejects.toThrow(
      "invalid streaming event",
    );
  });

  it("rejects truncated or unexpectedly namespaced public API tool calls", async () => {
    fetchMock.mockResolvedValue(
      Response.json(completed([{ ...call, arguments: '{"name":' }])),
    );
    await expect(openai().chat(request)).rejects.toThrow(
      "invalid game tool arguments",
    );
    fetchMock.mockResolvedValue(
      Response.json(completed([{ ...call, namespace: "unexpected" }])),
    );
    await expect(openai().chat(request)).rejects.toThrow(
      "invalid game tool call",
    );
  });

  it("cancels a pending Responses read and skips requests already cancelled", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const result = await openai().chat(
      { ...request, stream: true },
      controller.signal,
    );
    const pending = result.iterator!.next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(
      openai().chat(request, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces Chat Completions output-budget exhaustion", async () => {
    fetchMock.mockResolvedValue(completion("length"));
    await expect(
      OpenAiClient({ baseUrl: "https://openrouter.ai/api/v1" }).chat(request),
    ).rejects.toThrow("lower the thinking level");
  });

  it("preserves OpenRouter catalog capabilities and output token limits", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: [
          {
            id: "reasoner",
            reasoning: {
              supported_efforts: ["low", "high"],
              default_effort: "low",
              mandatory: true,
            },
            top_provider: { max_completion_tokens: 64000 },
            supported_parameters: ["reasoning", "tools"],
          },
          { id: "ordinary", reasoning: { supported_efforts: [] } },
          { id: "unknown" },
        ],
      }),
    );
    const models = await OpenAiClient({
      baseUrl: "https://openrouter.ai/api/v1",
    }).models();
    expect(models[0]).toMatchObject({
      reasoning: {
        supportedEfforts: ["low", "high"],
        defaultEffort: "low",
        mandatory: true,
      },
      maxOutputTokens: 64000,
      supportsToolCalls: true,
      supportedParameters: ["reasoning", "tools"],
    });
    expect(models[1].reasoning?.supportedEfforts).toEqual([]);
    expect(models[2].reasoning).toBeUndefined();
  });

  it("uses documented capability fallback only for direct OpenAI catalogs", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ data: [{ id: "gpt-5" }] })),
    );
    expect((await openai().models())[0].reasoning?.supportedEfforts).toContain(
      "high",
    );
    expect(
      (
        await OpenAiClient({
          baseUrl: "https://compatible.example/v1",
        }).models()
      )[0].reasoning,
    ).toBeUndefined();
  });
});
