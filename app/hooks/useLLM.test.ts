import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types";
import { LogEntryMode } from "@/types/log.type";
import { parseOpenAIStream } from "@/services/llm/streaming";
import { useTaleStore } from "@/store/useTaleStore";
import { useLLM, type LlmSendResult } from "./useLLM";

const { sendRoleChat } = vi.hoisted(() => ({ sendRoleChat: vi.fn() }));

vi.mock("@/services/llm", () => ({
  resolveModelRole: () => ({
    model: { id: "narrator-model", name: "Narrator" },
    config: { baseUrl: "https://example.test/v1" },
  }),
  sendRoleChat,
}));

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@/services/llm/promptBuilder", () => ({
  buildMessage: async () => ({
    model: "narrator-model",
    messages: [{ role: "user", content: "Open the door" }],
    stream: true,
  }),
}));

function renderLlmHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let llm: ReturnType<typeof useLLM> | undefined;

  function Harness() {
    llm = useLLM();
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get llm() {
      if (!llm) throw new Error("Harness did not render.");
      return llm;
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const callbacks = () => ({
  onStoryStream: vi.fn(),
  onThinkingStream: vi.fn(),
  onActionsReady: vi.fn(),
  onActionParseError: vi.fn(),
  onError: vi.fn(),
});

describe("useLLM", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    sendRoleChat.mockReset();
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "tale-1",
    });
  });

  it("stops a reply whose connection went quiet, so the next turn can start", async () => {
    sendRoleChat.mockImplementation(
      async (_role: string, _req: unknown, signal: AbortSignal) => ({
        content: "",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        iterator: parseOpenAIStream(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"The door"}}]}\n',
                ),
              );
            },
          }),
          { signal },
        ),
      }),
    );
    const harness = renderLlmHarness();
    const handlers = callbacks();
    let pending!: Promise<LlmSendResult>;
    act(() => {
      pending = harness.llm.send(
        { text: "Open the door", mode: LogEntryMode.DO },
        handlers,
      );
    });
    await vi.waitFor(() =>
      expect(handlers.onStoryStream).toHaveBeenCalledWith("The door"),
    );
    expect(harness.llm.loading).toBe(true);

    let result!: LlmSendResult;
    await act(async () => {
      harness.llm.cancel();
      result = await pending;
    });

    expect(result.status).toBe("aborted");
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(harness.llm.loading).toBe(false);
    harness.cleanup();
  });

  describe("Game Master tool calls", () => {
    const sse = (deltas: unknown[]) =>
      parseOpenAIStream(
        new Response(
          [
            ...deltas.map((delta) => JSON.stringify({ choices: [{ delta }] })),
            "[DONE]",
          ]
            .map((data) => `data: ${data}\n\n`)
            .join(""),
        ).body!,
      );

    async function sendGm(response: unknown) {
      useTaleStore.setState({ gameMode: GameMode.GM });
      sendRoleChat.mockResolvedValue(response);
      const harness = renderLlmHarness();
      const handlers = callbacks();
      let result!: LlmSendResult;
      await act(async () => {
        result = await harness.llm.send(
          { text: "Open the door", mode: LogEntryMode.DO },
          handlers,
        );
      });
      harness.cleanup();
      return { handlers, result };
    }

    it("applies calls from a provider that sends no ids or indexes", async () => {
      const { handlers, result } = await sendGm({
        content: "",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        iterator: sse([
          { content: "A trap springs." },
          {
            tool_calls: [
              {
                type: "function",
                function: {
                  name: "modify_stat",
                  arguments: '{"name":"HP","value":-2}',
                },
              },
              {
                type: "function",
                function: {
                  name: "add_to_inventory",
                  arguments: '{"item":"Key"}',
                },
              },
            ],
          },
        ]),
      });
      expect(result.status).toBe("completed");
      expect(handlers.onActionsReady).toHaveBeenCalledWith([
        { type: "MODIFY_STAT", payload: { name: "HP", value: -2 } },
        { type: "ADD_TO_INVENTORY", payload: { item: "Key" } },
      ]);
      expect(handlers.onActionParseError).not.toHaveBeenCalled();
    });

    it("applies the valid calls and reports the ones it could not read", async () => {
      const { handlers } = await sendGm({
        content: "",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        iterator: sse([
          {
            tool_calls: [
              {
                index: 0,
                id: "call_a",
                function: { name: "modify_stat", arguments: '{"name":"HP"' },
              },
              {
                index: 1,
                id: "call_b",
                function: {
                  name: "add_to_inventory",
                  arguments: '{"item":"Key"}',
                },
              },
            ],
          },
        ]),
      });
      expect(handlers.onActionsReady).toHaveBeenCalledWith([
        { type: "ADD_TO_INVENTORY", payload: { item: "Key" } },
      ]);
      expect(handlers.onActionParseError).toHaveBeenCalledOnce();
    });

    it("reports unreadable calls from a response that was not streamed", async () => {
      const { handlers } = await sendGm({
        content: "A trap springs.",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        tool_calls: [
          {
            id: "call_a",
            type: "function",
            function: { name: "modify_stat", arguments: '{"name":"HP"}' },
          },
        ],
      });
      expect(handlers.onActionsReady).not.toHaveBeenCalled();
      expect(handlers.onActionParseError).toHaveBeenCalledOnce();
    });
  });
});
