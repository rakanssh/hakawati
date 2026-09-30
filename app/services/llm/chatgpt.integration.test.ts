import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaySession } from "@/hooks/usePlaySession";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { ApiPreset, GameMode, LogEntryMode, LogEntryRole } from "@/types";
import { generateQuickstartTale } from "./quickstartTaleGenerator";
import type { ReasoningEffort } from "./schema";

const { fetchChatGpt, persistence } = vi.hoisted(() => ({
  fetchChatGpt: vi.fn(),
  persistence: {
    saveTurn: vi.fn(),
    completePendingTurn: vi.fn(),
    retryTurn: vi.fn(),
    editEntry: vi.fn(),
    retryEntry: vi.fn(),
    undoToEntryCount: vi.fn(),
    redoEntry: vi.fn(),
    saving: false,
  },
}));

// Keep provider routing, prompt construction, Responses decoding, game actions,
// and utility parsing real. Only native transport and disk persistence are mocked.
vi.mock("@/services/chatgpt", () => ({ fetchChatGpt }));
vi.mock("@/hooks/useGameSaves", () => ({
  usePersistTale: () => persistence,
}));
vi.mock("@/repositories/tale.repository", () => ({ getLogEntries: vi.fn() }));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

type Event = { type: string; [key: string]: unknown };

function encodeEvents(events: Event[]): Uint8Array {
  return new TextEncoder().encode(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(""),
  );
}

function streamResponse(events: Event[]): Response {
  const bytes = encodeEvents(events);
  // Split arbitrary bytes, including SSE/JSON tokens and multi-byte text.
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 23) {
          controller.enqueue(bytes.slice(offset, offset + 23));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function completed(output: unknown[] = []): Event {
  return {
    type: "response.completed",
    response: {
      id: "resp_test",
      status: "completed",
      output,
      usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
    },
  };
}

function functionEvents(index: number, name: string, args: string): Event[] {
  const item = {
    type: "function_call",
    id: `fc_${index}`,
    call_id: `call_${index}`,
    namespace: "hakawati",
    name,
    arguments: args,
    status: "completed",
  };
  const split = Math.floor(args.length / 2);
  return [
    {
      type: "response.output_item.added",
      output_index: index,
      item: { ...item, arguments: "", status: "in_progress" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: index,
      item_id: item.id,
      delta: args.slice(0, split),
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: index,
      item_id: item.id,
      delta: args.slice(split),
    },
    { type: "response.output_item.done", output_index: index, item },
  ];
}

function renderSession() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof usePlaySession> | undefined;
  const root = createRoot(container);
  function Harness() {
    controls = usePlaySession();
    return null;
  }
  act(() => root.render(createElement(Harness)));
  return {
    get controls() {
      if (!controls) throw new Error("Play session did not render.");
      return controls;
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ChatGPT provider through game and utility flows", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    for (const role of ["narrator", "utility"] as const) {
      useSettingsStore.getState().setRoleActivePreset(role, ApiPreset.CHATGPT);
      useSettingsStore.getState().setRoleModel(role, {
        id: `chatgpt-${role}`,
        name: `ChatGPT ${role}`,
        contextLength: 100000,
        supportsToolCalls: true,
        reasoning: {
          supportedEfforts: ["low", "medium", "high"],
          defaultEffort: "medium",
        },
      });
    }
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "chatgpt-tale",
      name: "The locked vault",
      gameMode: GameMode.GM,
      stats: [{ name: "HP", value: 95, range: [0, 100] }],
      inventory: [{ id: "old-key", name: "Key", description: "The vault key" }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useTaleStore.setState(useTaleStore.getInitialState());
  });

  it("streams GM narration and namespaced tools into reversible game state", async () => {
    const statCall = functionEvents(
      2,
      "modify_stat",
      '{"name":"HP","value":10}',
    );
    const removeCall = functionEvents(
      3,
      "remove_from_inventory",
      '{"item":"Key"}',
    );
    const addCall = functionEvents(
      4,
      "add_to_inventory",
      '{"item":"Silver coin"}',
    );
    fetchChatGpt.mockResolvedValueOnce(
      streamResponse([
        {
          type: "response.reasoning_summary_text.delta",
          output_index: 0,
          summary_index: 0,
          delta: "The key opens the vault.",
        },
        {
          type: "response.output_text.delta",
          output_index: 1,
          content_index: 0,
          delta: "The vault opens. ",
        },
        ...statCall,
        ...removeCall,
        ...addCall,
        {
          type: "response.output_text.delta",
          output_index: 1,
          content_index: 0,
          delta: "مرحبا — a coin glints.",
        },
        completed([
          {
            type: "reasoning",
            summary: [
              { type: "summary_text", text: "The key opens the vault." },
            ],
          },
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "The vault opens. مرحبا — a coin glints.",
              },
            ],
          },
          statCall.at(-1)!.item,
          removeCall.at(-1)!.item,
          addCall.at(-1)!.item,
        ]),
      ]),
    );
    const harness = renderSession();
    try {
      const entry = await act(async () =>
        harness.controls.executeLlmSend("Unlock the vault", LogEntryMode.DO),
      );
      expect(entry).toMatchObject({
        role: LogEntryRole.GM,
        text: "The vault opens. مرحبا — a coin glints.",
        thinking: "The key opens the vault.",
        actions: [
          { type: "MODIFY_STAT", payload: { name: "HP", value: 10 } },
          { type: "REMOVE_FROM_INVENTORY", payload: { item: "Key" } },
          { type: "ADD_TO_INVENTORY", payload: { item: "Silver coin" } },
        ],
      });
      expect(entry?.error).toBeUndefined();
      expect(useTaleStore.getState().stats[0].value).toBe(100);
      expect(useTaleStore.getState().inventory).toEqual([
        expect.objectContaining({ name: "Silver coin" }),
      ]);
      expect(persistence.saveTurn).toHaveBeenCalledWith("chatgpt-tale", [
        entry,
      ]);

      const [path, init] = fetchChatGpt.mock.calls[0];
      expect(path).toBe("/responses");
      const request = JSON.parse(init.body);
      expect(request).toMatchObject({
        model: "chatgpt-narrator",
        stream: true,
        store: false,
        tools: [
          expect.objectContaining({ type: "namespace", name: "hakawati" }),
        ],
      });
      expect(JSON.stringify(request.input)).toContain("Unlock the vault");

      act(() => useTaleStore.getState().undo());
      expect(useTaleStore.getState().stats[0].value).toBe(95);
      expect(useTaleStore.getState().inventory).toEqual([
        { id: "old-key", name: "Key", description: "The vault key" },
      ]);
    } finally {
      harness.cleanup();
    }
  });

  it.each<{
    narrator: ReasoningEffort | undefined;
    utility: ReasoningEffort | undefined;
  }>([
    { narrator: "high", utility: "low" },
    { narrator: undefined, utility: "low" },
    { narrator: "high", utility: undefined },
  ])(
    "sends saved narrator $narrator and utility $utility levels through the game and generation flows",
    async ({ narrator, utility }) => {
      const settings = useSettingsStore.getState();
      settings.setRoleReasoningEffort("narrator", narrator);
      settings.setRoleReasoningEffort("utility", utility);
      settings.setThinkingVisibility("none");
      settings.setTemperature(0.7);
      settings.setTopP(0.9);
      settings.setTopK(30);
      settings.setFrequencyPenalty(0.2);
      settings.setPresencePenalty(0.3);
      settings.setSeed(42);
      settings.setMaxTokens(8192);
      for (const role of ["narrator", "utility"] as const) {
        settings.setRoleActivePreset(role, ApiPreset.GENERIC);
        settings.setRoleActivePreset(role, ApiPreset.CHATGPT);
      }
      expect(
        useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
      ).toBe(narrator);
      expect(
        useSettingsStore.getState().modelRoles.utility.reasoningEffort,
      ).toBe(utility);

      const generated = {
        name: "The quiet grove",
        description: "A path through an ancient forest.",
        plot: "Follow the path to the grove.",
        openingText: "A leaf falls at your feet.",
        stats: [],
        inventory: [],
        storyCards: [],
      };
      fetchChatGpt
        .mockResolvedValueOnce(
          streamResponse([
            { type: "response.output_text.delta", delta: "A new path opens." },
            completed(),
          ]),
        )
        .mockResolvedValueOnce(
          streamResponse([
            {
              type: "response.output_text.delta",
              delta: JSON.stringify(generated),
            },
            completed(),
          ]),
        );
      useTaleStore.setState({ gameMode: GameMode.STORY_TELLER });
      const harness = renderSession();
      try {
        const entry = await act(async () =>
          harness.controls.executeLlmSend("Follow the path", LogEntryMode.DO),
        );
        expect(entry?.text).toBe("A new path opens.");
        expect(entry?.error).toBeUndefined();
        const tale = await generateQuickstartTale({
          gameMode: GameMode.STORY_TELLER,
          world: "An ancient forest",
          characterName: "Sam",
          archetype: "Explorer",
        });
        expect(tale).toMatchObject({
          name: generated.name,
          openingText: generated.openingText,
        });
        expect(fetchChatGpt).toHaveBeenCalledTimes(2);
        for (const [index, role, effort] of [
          [0, "narrator", narrator],
          [1, "utility", utility],
        ] as const) {
          const [path, init] = fetchChatGpt.mock.calls[index];
          expect(path).toBe("/responses");
          const request = JSON.parse(init.body);
          expect(request).toMatchObject({
            model: `chatgpt-${role}`,
            stream: true,
            store: false,
          });
          if (effort === undefined) {
            // A published model default must not become an explicit override.
            expect(request).not.toHaveProperty("reasoning");
          } else {
            expect(request.reasoning).toEqual({ effort });
          }
          for (const parameter of [
            "reasoning_effort",
            "temperature",
            "topP",
            "top_p",
            "topK",
            "top_k",
            "frequencyPenalty",
            "frequency_penalty",
            "presencePenalty",
            "presence_penalty",
            "seed",
            "max_tokens",
            "max_output_tokens",
            "options",
          ]) {
            expect(request).not.toHaveProperty(parameter);
          }
        }
      } finally {
        harness.cleanup();
      }
    },
  );

  it("preserves partial narration but never applies GM tools from a failed stream", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchChatGpt.mockResolvedValueOnce(
      streamResponse([
        { type: "response.output_text.delta", delta: "The vault shakes." },
        ...functionEvents(1, "modify_stat", '{"name":"HP","value":-90}'),
        {
          type: "response.failed",
          response: {
            status: "failed",
            error: {
              code: "subscription_sharing_usage_limit_exceeded",
              message: "ChatGPT plan usage limit reached.",
            },
          },
        },
      ]),
    );
    const harness = renderSession();
    try {
      const entry = await act(async () =>
        harness.controls.executeLlmSend("Unlock the vault", LogEntryMode.DO),
      );
      expect(entry?.text).toBe("The vault shakes.");
      expect(entry?.error).toBeInstanceOf(Error);
      expect(entry?.actions).toBeUndefined();
      expect(useTaleStore.getState().stats[0].value).toBe(95);
      expect(persistence.saveTurn).toHaveBeenCalledWith("chatgpt-tale", [
        entry,
      ]);
    } finally {
      harness.cleanup();
    }
  });

  it("uses free-form narration in Story Teller mode without sending GM tools", async () => {
    useTaleStore.setState({ gameMode: GameMode.STORY_TELLER });
    fetchChatGpt.mockResolvedValueOnce(
      streamResponse([
        { type: "response.output_text.delta", delta: "A new path opens." },
        completed(),
      ]),
    );
    const harness = renderSession();
    try {
      const entry = await act(async () =>
        harness.controls.executeLlmSend("Follow the path", LogEntryMode.DO),
      );
      expect(entry?.text).toBe("A new path opens.");
      expect(entry?.error).toBeUndefined();
      const request = JSON.parse(fetchChatGpt.mock.calls[0][1].body);
      expect(request.model).toBe("chatgpt-narrator");
      expect(request.tools).toBeUndefined();
      expect(useTaleStore.getState().stats[0].value).toBe(95);
    } finally {
      harness.cleanup();
    }
  });

  it("collects the utility stream through completion before creating a quickstart tale", async () => {
    const generated = {
      name: "The vault",
      description: "A locked vault and a missing key.",
      plot: "Find the key before dawn.",
      openingText: "You stand before an iron door.",
      stats: [{ name: "HP", value: 80, range: [0, 100] }],
      inventory: ["Lantern"],
      storyCards: [
        {
          title: "Vault",
          triggers: ["vault"],
          content: "An ancient treasury.",
        },
      ],
    };
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    fetchChatGpt.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const result = generateQuickstartTale({
      gameMode: GameMode.GM,
      world: "An abandoned treasury",
      characterName: "Sam",
      archetype: "Explorer",
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    controller.enqueue(
      encodeEvents([
        {
          type: "response.output_text.delta",
          delta: JSON.stringify(generated),
        },
      ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    controller.enqueue(encodeEvents([completed()]));
    controller.close();

    const tale = await result;
    expect(tale).toMatchObject({
      name: generated.name,
      plot: generated.plot,
      openingText: generated.openingText,
      stats: generated.stats,
      inventory: [{ id: expect.any(String), name: "Lantern" }],
      storyCards: [{ title: "Vault", content: "An ancient treasury." }],
    });
    const request = JSON.parse(fetchChatGpt.mock.calls[0][1].body);
    expect(request).toMatchObject({
      model: "chatgpt-utility",
      stream: true,
      store: false,
    });
    expect(request.tools).toBeUndefined();
    expect(request.max_output_tokens).toBeUndefined();
  });
});
