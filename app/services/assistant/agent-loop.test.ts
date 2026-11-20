import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResponse, StreamChunk } from "@/services/llm/schema";
import { ResponseMode } from "@/types/api.type";
import { runAgentLoop, type AgentEvent, type AgentTool } from "./agent-loop";
import { OMITTED_RESULT } from "./history";

const { sendRoleChat, resolveModelRole } = vi.hoisted(() => ({
  sendRoleChat: vi.fn(),
  resolveModelRole: vi.fn(),
}));
vi.mock("@/services/llm", () => ({ sendRoleChat, resolveModelRole }));
vi.mock("@/services/llm/tokenCounter", () => ({
  countTokens: (text: string) => text.length,
}));

const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

function streamed(
  chunks: StreamChunk[],
  extra: Partial<ChatResponse> = {},
): ChatResponse {
  async function* iterator() {
    for (const chunk of chunks) yield chunk;
  }
  return { content: "", iterator: iterator(), raw: null, usage, ...extra };
}

function callChunks(id: string, name: string, args: string): StreamChunk[] {
  const half = Math.ceil(args.length / 2);
  return [
    { tool_calls: [{ index: 0, id, type: "function", function: { name } }] },
    {
      tool_calls: [{ index: 0, function: { arguments: args.slice(0, half) } }],
    },
    { tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] },
  ];
}

function tool(
  name: string,
  run: AgentTool["run"] = async () => ({ ok: true }),
): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: name,
        parameters: { type: "object", properties: {} },
      },
    },
    run: vi.fn(run),
  };
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    sendRoleChat.mockReset();
    resolveModelRole.mockReset();
    resolveModelRole.mockReturnValue({ model: { id: "model-a" } });
  });

  it("runs tools across rounds and feeds their results back", async () => {
    const lookup = tool("lookup", async (args) => ({ found: args.name }));
    sendRoleChat
      .mockResolvedValueOnce(
        streamed(
          [
            { thinking: "Check the card." },
            { content: "Looking." },
            ...callChunks("call_1", "lookup", '{"name":"Mara"}'),
          ],
          {
            replay: {
              format: "responses",
              model: "model-a",
              items: [{ type: "reasoning" }],
            },
          },
        ),
      )
      .mockResolvedValueOnce(streamed([{ content: "Mara is a smuggler." }]));
    const events: AgentEvent[] = [];

    const result = await runAgentLoop({
      role: "utility",
      messages: [{ role: "user", content: "Who is Mara?" }],
      tools: [lookup],
      toolNamespace: { name: "hakawati", description: "Tale tools." },
      maxTokens: 2000,
      onEvent: (event) => events.push(event),
    });

    expect(lookup.run).toHaveBeenCalledWith({ name: "Mara" }, undefined);
    expect(result.stopReason).toBe("done");
    expect(result.messages).toEqual([
      {
        role: "assistant",
        content: "Looking.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "lookup", arguments: '{"name":"Mara"}' },
          },
        ],
        replay: {
          format: "responses",
          model: "model-a",
          items: [{ type: "reasoning" }],
        },
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: '{"found":"Mara"}',
      },
      { role: "assistant", content: "Mara is a smuggler." },
    ]);
    const [role, firstRequest] = sendRoleChat.mock.calls[0];
    expect(role).toBe("utility");
    expect(firstRequest).toMatchObject({
      model: "model-a",
      stream: true,
      max_tokens: 2000,
      responseMode: ResponseMode.TOOL_CALLING,
      toolNamespace: { name: "hakawati", description: "Tale tools." },
    });
    expect(firstRequest.tools).toEqual([lookup.definition]);
    expect(sendRoleChat.mock.calls[1][1].messages).toHaveLength(3);
    expect(events.map((event) => event.type)).toEqual([
      "thinking",
      "text",
      "tool_start",
      "tool_end",
      "text",
    ]);
  });

  it("returns tool failures to the model instead of stopping", async () => {
    const broken = tool("broken", async () => {
      throw new Error("No such card.");
    });
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([
          ...callChunks("call_1", "broken", "{}"),
          {
            tool_calls: [
              {
                index: 1,
                id: "call_2",
                function: { name: "missing", arguments: "{}" },
              },
            ],
          },
          {
            tool_calls: [
              {
                index: 2,
                id: "call_3",
                function: { name: "broken", arguments: "{oops" },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamed([{ content: "Sorry." }]));
    const events: AgentEvent[] = [];

    const result = await runAgentLoop({
      role: "utility",
      messages: [{ role: "user", content: "Edit it." }],
      tools: [broken],
      onEvent: (event) => events.push(event),
    });

    expect(result.messages.slice(1, 4).map((m) => m.content)).toEqual([
      '{"error":"No such card."}',
      '{"error":"Unknown tool: missing"}',
      '{"error":"Arguments were not valid JSON."}',
    ]);
    expect(broken.run).toHaveBeenCalledTimes(1);
    expect(
      events.flatMap((event) =>
        event.type === "tool_end" ? [event.error] : [],
      ),
    ).toEqual([
      "No such card.",
      "Unknown tool: missing",
      "Arguments were not valid JSON.",
    ]);
  });

  it("gives an id to a named call the server sent without one", async () => {
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([
          {
            tool_calls: [
              { index: 0, function: { name: "a", arguments: "{}" } },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamed([{ content: "Done." }]));
    const result = await runAgentLoop({
      role: "utility",
      messages: [],
      tools: [tool("a")],
    });
    expect(result.messages[0].tool_calls?.[0].id).toBe("call_0_0");
    expect(result.messages[1].tool_call_id).toBe("call_0_0");
  });

  it("uses tool calls from a response that was not streamed", async () => {
    const a = tool("a");
    sendRoleChat
      .mockResolvedValueOnce({
        content: "",
        raw: null,
        usage,
        tool_calls: [
          {
            id: "call_x",
            type: "function",
            function: { name: "a", arguments: "{}" },
          },
        ],
      })
      .mockResolvedValueOnce({ content: "Done.", raw: null, usage });
    const result = await runAgentLoop({
      role: "utility",
      messages: [],
      tools: [a],
    });
    expect(a.run).toHaveBeenCalledOnce();
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Done.",
    });
  });

  it("stops after the round limit", async () => {
    sendRoleChat.mockImplementation(async () =>
      streamed(callChunks("call_1", "a", "{}")),
    );
    const result = await runAgentLoop({
      role: "utility",
      messages: [],
      tools: [tool("a")],
      maxRounds: 2,
    });
    expect(result.stopReason).toBe("max_rounds");
    expect(sendRoleChat).toHaveBeenCalledTimes(2);
    expect(result.messages).toHaveLength(4);
  });

  it("allows 50 rounds by default", async () => {
    sendRoleChat.mockImplementation(async () =>
      streamed(callChunks("call_1", "a", "{}")),
    );
    await runAgentLoop({ role: "utility", messages: [], tools: [tool("a")] });
    expect(sendRoleChat).toHaveBeenCalledTimes(50);
  });

  it("asks for a summary without tools when the rounds run out", async () => {
    sendRoleChat
      .mockResolvedValueOnce(streamed(callChunks("call_1", "a", "{}")))
      .mockResolvedValueOnce(streamed(callChunks("call_2", "a", "{}")))
      .mockResolvedValueOnce(streamed([{ content: "Two done, one left." }]));
    const events: AgentEvent[] = [];
    const result = await runAgentLoop({
      role: "utility",
      messages: [{ role: "user", content: "Do three things." }],
      tools: [tool("a")],
      maxRounds: 2,
      wrapUp: "Wrap up.",
      onEvent: (event) => events.push(event),
    });
    const request = sendRoleChat.mock.calls[2][1];
    expect(request.toolChoice).toBe("none");
    expect(request.messages.at(-1)).toEqual({
      role: "user",
      content: "Wrap up.",
    });
    expect(result.stopReason).toBe("max_rounds");
    expect(result.messages).toHaveLength(5);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Two done, one left.",
    });
    expect(events.at(-1)).toEqual({
      type: "text",
      delta: "Two done, one left.",
    });
  });

  it("drops tool calls from the summary round", async () => {
    const a = tool("a");
    sendRoleChat
      .mockResolvedValueOnce(streamed(callChunks("call_1", "a", "{}")))
      .mockResolvedValueOnce(
        streamed(
          [{ content: "One done." }, ...callChunks("call_2", "a", "{}")],
          { replay: { format: "responses", model: "model-a", items: [] } },
        ),
      );
    const result = await runAgentLoop({
      role: "utility",
      messages: [],
      tools: [a],
      maxRounds: 1,
      wrapUp: "Wrap up.",
    });
    expect(a.run).toHaveBeenCalledOnce();
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "One done.",
    });
  });

  it("keeps the steps when the summary round fails", async () => {
    sendRoleChat
      .mockResolvedValueOnce(streamed(callChunks("call_1", "a", "{}")))
      .mockRejectedValueOnce(new Error("tool_choice is not supported"));
    const result = await runAgentLoop({
      role: "utility",
      messages: [],
      tools: [tool("a")],
      maxRounds: 1,
      wrapUp: "Wrap up.",
    });
    expect(result.stopReason).toBe("max_rounds");
    expect(result.messages).toHaveLength(2);
  });

  it("omits older tool results once the context fills, keeping the latest", async () => {
    const big = "x".repeat(1000);
    const reader = tool("read", async () => big);
    for (let round = 0; round < 6; round += 1)
      sendRoleChat.mockResolvedValueOnce(
        streamed(callChunks(`call_${round}`, "read", "{}")),
      );
    sendRoleChat.mockResolvedValueOnce(streamed([{ content: "Read it all." }]));
    const result = await runAgentLoop({
      role: "utility",
      messages: [{ role: "user", content: "Read everything." }],
      tools: [reader],
      contextLength: 3000,
    });
    const sent = sendRoleChat.mock.calls[6][1].messages as {
      role: string;
      content: string;
    }[];
    expect(sent.filter((m) => m.role === "tool").map((m) => m.content)).toEqual(
      [OMITTED_RESULT, OMITTED_RESULT, big, big, big, big],
    );
    expect(
      sendRoleChat.mock.calls[3][1].messages
        .filter((m: { role: string }) => m.role === "tool")
        .map((m: { content: string }) => m.content),
    ).toEqual([big, big, big]);
    expect(
      result.messages
        .filter((m) => m.role === "tool")
        .every((m) => m.content === big),
    ).toBe(true);
  });

  it("stops between tools when cancelled and does not run the rest", async () => {
    const controller = new AbortController();
    const first = tool("first", async () => {
      controller.abort();
      return {};
    });
    const second = tool("second");
    sendRoleChat.mockResolvedValueOnce(
      streamed([
        ...callChunks("call_1", "first", "{}"),
        {
          tool_calls: [
            {
              index: 1,
              id: "call_2",
              function: { name: "second", arguments: "{}" },
            },
          ],
        },
      ]),
    );
    await expect(
      runAgentLoop({
        role: "utility",
        messages: [],
        tools: [first, second],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(second.run).not.toHaveBeenCalled();
    expect(sendRoleChat).toHaveBeenCalledOnce();
  });

  it("rethrows a cancellation raised inside a tool", async () => {
    const controller = new AbortController();
    const slow = tool("slow", async () => {
      controller.abort();
      throw new DOMException("Request cancelled.", "AbortError");
    });
    sendRoleChat.mockResolvedValueOnce(streamed(callChunks("c", "slow", "{}")));
    await expect(
      runAgentLoop({
        role: "utility",
        messages: [],
        tools: [slow],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
