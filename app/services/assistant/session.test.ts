import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResponse, StreamChunk } from "@/services/llm/schema";
import type { AssistantMessage, AssistantThread } from "@/types/assistant.type";
import type { AssistantToolContext } from "./tools/define";
import { GameMode } from "@/types/context.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const { db, sendRoleChat, resolveModelRole } = vi.hoisted(() => ({
  db: {
    threads: [] as AssistantThread[],
    messages: [] as AssistantMessage[],
  },
  sendRoleChat: vi.fn(),
  resolveModelRole: vi.fn(),
}));

vi.mock("@/services/llm", () => ({ sendRoleChat, resolveModelRole }));
vi.mock("@/repositories/tale.repository", () => ({}));
vi.mock("@/repositories/scenario.repository", () => ({}));
vi.mock("@/repositories/assistant.repository", () => {
  const newest = (threads: AssistantThread[]) =>
    [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    listAssistantThreads: async () => newest(db.threads),
    getLatestAssistantThread: async (taleId?: string) =>
      newest(
        db.threads.filter(
          (thread) => taleId === undefined || thread.taleId === taleId,
        ),
      )[0] ?? null,
    createAssistantThread: async (thread: AssistantThread) => {
      db.threads.push({ ...thread });
    },
    deleteAssistantThread: async (id: string) => {
      db.threads = db.threads.filter((thread) => thread.id !== id);
    },
    listAssistantMessages: async (threadId: string) =>
      db.messages.filter((message) => message.threadId === threadId),
    appendAssistantMessage: async (message: Omit<AssistantMessage, "seq">) => {
      const saved = {
        ...message,
        seq:
          db.messages.filter((m) => m.threadId === message.threadId).length + 1,
      };
      db.messages.push(saved);
      return saved;
    },
    updateAssistantMessageChanges: async (
      id: string,
      changes: AssistantMessage["changes"],
    ) => {
      const message = db.messages.find((m) => m.id === id);
      if (message) message.changes = changes;
    },
  };
});

const cardChange = {
  taleId: "t1",
  kind: "card" as const,
  id: "mara",
  before: null,
  after: null,
};
vi.mock("./tale-edits", () => ({
  withTaleWrites: (_signal: unknown, run: () => unknown) => run(),
  editTaleSetup: async () => [cardChange],
  revertChanges: async (changes: Array<Record<string, unknown>>) =>
    changes.map((change) => ({ ...change, undone: true })),
}));

const scenarioChange = {
  kind: "scenario" as const,
  target: "library" as const,
  scenarioId: "s1",
  before: null,
  after: {
    id: "s1",
    name: "Lantern",
    description: "",
    initialGameMode: GameMode.STORY_TELLER,
    content: [],
  },
};
const revertScenarioChanges = vi.fn();
vi.mock("./scenario-edits", () => ({
  NEW_SCENARIO: "new",
  openDraft: () => null,
  editScenario: async () => scenarioChange,
  scenarioFromTale: async () => scenarioChange,
  revertScenarioChanges,
}));

vi.mock("./tools/library", () => ({
  createLibraryTools: (context: AssistantToolContext) => [
    {
      definition: {
        type: "function",
        function: { name: "library", description: "", parameters: {} },
      },
      run: async () =>
        (await context.confirm!({ action: "delete_tales", names: ["Mara"] }))
          ? { deleted: ["Mara"] }
          : { done: false, cancelled: true },
    },
  ],
}));
vi.mock("./tools/ai-setup", () => ({
  createAiSetupTools: (context: AssistantToolContext) => [
    {
      definition: {
        type: "function",
        function: { name: "ai_setup", description: "", parameters: {} },
      },
      run: async () => {
        context.afterRun!(() =>
          context.recordChanges!([
            {
              kind: "setting",
              key: "theme",
              before: "brass-night",
              after: "orbit",
            },
          ]),
        );
        return { appliesAfterThisReply: true };
      },
    },
  ],
}));

const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

function streamed(chunks: StreamChunk[]): ChatResponse {
  async function* iterator() {
    for (const chunk of chunks) yield chunk;
  }
  return { content: "", iterator: iterator(), raw: null, usage };
}

const contextCall: StreamChunk[] = [
  { content: "Looking." },
  {
    tool_calls: [
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: "get_context", arguments: "{}" },
      },
    ],
  },
];

async function load() {
  vi.resetModules();
  const session = await import("./session");
  const { useAssistantStore } = await import("@/store/useAssistantStore");
  return { session, store: useAssistantStore };
}

const home = { getPathname: () => "/" };

beforeEach(() => {
  localStorage.clear();
  db.threads = [];
  db.messages = [];
  sendRoleChat.mockReset();
  resolveModelRole.mockReset();
  resolveModelRole.mockReturnValue({ model: { id: "m" } });
});

describe("Hakawati chat session", () => {
  it("sends a message, runs tools, and saves both sides", async () => {
    const { session, store } = await load();
    sendRoleChat
      .mockResolvedValueOnce(streamed(contextCall))
      .mockResolvedValueOnce(streamed([{ content: "You are home." }]));

    await session.sendAssistantMessage("  Where am I?  ", home);

    const state = store.getState();
    expect(state.run).toBeNull();
    expect(state.error).toBeNull();
    expect(db.threads).toEqual([
      expect.objectContaining({ title: "Where am I?", taleId: null }),
    ]);
    expect(state.threads.map((t) => t.id)).toEqual([db.threads[0].id]);
    expect(state.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Where am I?"],
      ["assistant", "Looking.\n\nYou are home."],
    ]);
    const reply = state.messages[1];
    expect(reply.activity).toEqual([{ tool: "get_context", at: 8 }]);
    expect(reply.turn?.map((m) => m.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(JSON.parse(reply.turn![1].content)).toEqual({ page: "home" });

    const firstRequest = sendRoleChat.mock.calls[0][1];
    expect(sendRoleChat.mock.calls[0][0]).toBe("hakawati");
    expect(firstRequest.messages[0].role).toBe("system");
    expect(firstRequest.messages.at(-1).content).toMatch(
      /^<context>\n\{"page":"home"\}\n<\/context>\n\nWhere am I\?$/,
    );
    expect(firstRequest.toolNamespace.name).toBe("hakawati");
  });

  it("pauses a reply that runs out of steps and picks it up on Continue", async () => {
    const { session, store } = await load();
    sendRoleChat.mockImplementation(async (_role, request) =>
      request.toolChoice === "none"
        ? streamed([{ content: "More to do." }])
        : streamed(contextCall),
    );

    await session.sendAssistantMessage("Do a lot.", home);

    const reply = store.getState().messages[1];
    expect(reply.status).toBe("paused");
    expect(reply.content.endsWith("More to do.")).toBe(true);
    expect(reply.activity).toHaveLength(50);

    sendRoleChat.mockReset();
    sendRoleChat.mockResolvedValueOnce(streamed([{ content: "Done." }]));
    await session.sendAssistantMessage("Continue", home);

    const sent = sendRoleChat.mock.calls[0][1].messages;
    expect(
      sent.filter((m: { role: string }) => m.role === "tool"),
    ).toHaveLength(50);
    expect(sent.at(-2)).toEqual({ role: "assistant", content: "More to do." });
    expect(store.getState().messages.at(-1)?.status).toBeUndefined();
  });

  it("saves where each step happened in the trimmed reply", async () => {
    const { session, store } = await load();
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([{ content: "\n\nLet me look." }, ...contextCall.slice(1)]),
      )
      .mockResolvedValueOnce(streamed([{ content: "You are home." }]));

    await session.sendAssistantMessage("Where am I?", home);

    const reply = store.getState().messages.at(-1)!;
    expect(reply.content).toBe("Let me look.\n\nYou are home.");
    expect(reply.activity).toEqual([{ tool: "get_context", at: 12 }]);
  });

  it("shows stored replies, not the context block, on the next turn", async () => {
    const { session } = await load();
    sendRoleChat
      .mockResolvedValueOnce(streamed([{ content: "Hi." }]))
      .mockResolvedValueOnce(streamed([{ content: "Again." }]));
    await session.sendAssistantMessage("First", home);
    await session.sendAssistantMessage("Second", home);
    const messages = sendRoleChat.mock.calls[1][1].messages;
    expect(
      messages.slice(1).map((m: { content: string }) => m.content),
    ).toEqual(["First", "Hi.", expect.stringMatching(/Second$/)]);
  });

  it("keeps what was written when the player stops a reply", async () => {
    const { session, store } = await load();
    sendRoleChat.mockImplementationOnce(
      async (_role: string, _request: unknown, signal: AbortSignal) => {
        async function* iterator() {
          yield { content: "Part" };
          await new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("Request cancelled.", "AbortError")),
            ),
          );
        }
        return { content: "", iterator: iterator(), raw: null, usage };
      },
    );
    const sending = session.sendAssistantMessage("Tell me", home);
    await vi.waitFor(() => expect(store.getState().run?.content).toBe("Part"));
    session.stopAssistant();
    await sending;
    const reply = store.getState().messages.at(-1)!;
    expect(reply).toMatchObject({ content: "Part", status: "stopped" });
    expect(reply.turn).toBeUndefined();
    expect(store.getState().error).toBeNull();
  });

  it("says why a reply failed", async () => {
    const { session, store } = await load();
    resolveModelRole.mockImplementation(() => {
      throw new Error("No hakawati model selected.");
    });
    await session.sendAssistantMessage("Hello", home);
    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "assistant",
      status: "failed",
    });
    expect(store.getState().error).toBe("No hakawati model selected.");
  });

  it("opens a tale's latest chat when the player opens the tale", async () => {
    const { session, store } = await load();
    db.threads = [
      { id: "general", taleId: null, title: "G", createdAt: 1, updatedAt: 5 },
      { id: "mara", taleId: "t1", title: "M", createdAt: 1, updatedAt: 2 },
    ];

    await session.syncAssistantScope(null);
    expect(store.getState().threadId).toBe("general");

    await session.syncAssistantScope("t1");
    expect(store.getState().threadId).toBe("mara");

    await session.syncAssistantScope(null);
    expect(store.getState().threadId).toBe("mara");

    await session.syncAssistantScope("t2");
    expect(store.getState()).toMatchObject({ threadId: null, taleId: "t2" });

    store.setState({
      run: {
        content: "",
        thinking: "",
        activity: [],
        changes: [],
        toolRunning: false,
      },
    });
    await session.syncAssistantScope("t1");
    expect(store.getState().threadId).toBeNull();
  });

  describe("remembering the chat the player was on", () => {
    const threads = () => [
      { id: "general", taleId: null, title: "G", createdAt: 1, updatedAt: 9 },
      { id: "older", taleId: "t1", title: "O", createdAt: 1, updatedAt: 2 },
      { id: "newer", taleId: "t1", title: "N", createdAt: 1, updatedAt: 3 },
    ];

    it("keeps the open chat when the panel or tab shows it again", async () => {
      const { session, store } = await load();
      db.threads = threads();
      await session.syncAssistantScope("t1");
      await session.selectAssistantThread("general");
      await session.syncAssistantScope("t1");
      expect(store.getState().threadId).toBe("general");
    });

    it("goes back to the chat last open on a tale, not its latest", async () => {
      const { session, store } = await load();
      db.threads = threads();
      await session.syncAssistantScope("t1");
      expect(store.getState().threadId).toBe("newer");
      await session.selectAssistantThread("older");
      await session.syncAssistantScope("t2");
      expect(store.getState().threadId).toBeNull();
      await session.syncAssistantScope(null);
      await session.syncAssistantScope("t1");
      expect(store.getState().threadId).toBe("older");
    });

    it("opens the chat that was open when the app was last closed", async () => {
      db.threads = threads();
      const first = await load();
      await first.session.syncAssistantScope(null);
      await first.session.selectAssistantThread("older");

      const next = await load();
      await next.session.syncAssistantScope(null);
      expect(next.store.getState().threadId).toBe("older");
    });

    it("forgets a deleted chat", async () => {
      const { session, store } = await load();
      db.threads = threads();
      await session.syncAssistantScope("t1");
      await session.selectAssistantThread("older");
      await session.removeAssistantThread("older", "/play");
      await session.syncAssistantScope("t2");
      await session.syncAssistantScope("t1");
      expect(store.getState().threadId).toBe("newer");
    });
  });

  it("saves the changes a reply made and undoes them", async () => {
    const { session, store } = await load();
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([
          {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: {
                  name: "edit_story_cards",
                  arguments:
                    '{"taleId":"t1","ops":[{"op":"add","title":"Mara"}]}',
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamed([{ content: "Added Mara." }]));

    await session.sendAssistantMessage("Add Mara", home);
    const reply = store.getState().messages.at(-1)!;
    expect(reply.changes).toEqual([cardChange]);
    expect(reply.activity).toEqual([
      { tool: "edit_story_cards", at: 0, changed: true },
    ]);

    expect(await session.undoAssistantReply(reply.id)).toBe(0);
    expect(store.getState().messages.at(-1)!.changes).toEqual([
      { ...cardChange, undone: true },
    ]);
    expect(db.messages.at(-1)!.changes?.[0].undone).toBe(true);
    expect(store.getState().undoingId).toBeNull();
  });

  it("undoes a reply's tale and scenario changes together, in order", async () => {
    const { session, store } = await load();
    revertScenarioChanges.mockResolvedValueOnce({
      changes: [{ ...scenarioChange, undone: true }],
      kept: 2,
    });
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([
          {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: {
                  name: "edit_scenario",
                  arguments: '{"scenario":"new","name":"Lantern"}',
                },
              },
              {
                index: 1,
                id: "call_2",
                type: "function",
                function: {
                  name: "edit_story_cards",
                  arguments:
                    '{"taleId":"t1","ops":[{"op":"add","title":"Mara"}]}',
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamed([{ content: "Done." }]));

    await session.sendAssistantMessage("Make both", home);
    const reply = store.getState().messages.at(-1)!;
    expect(reply.changes).toEqual([scenarioChange, cardChange]);

    expect(await session.undoAssistantReply(reply.id)).toBe(2);
    expect(revertScenarioChanges).toHaveBeenCalledWith([scenarioChange]);
    expect(store.getState().messages.at(-1)!.changes).toEqual([
      { ...scenarioChange, undone: true },
      { ...cardChange, undone: true },
    ]);
  });

  it("starts a new chat for the tale on the play screen", async () => {
    const { session, store } = await load();
    const { useTaleStore } = await import("@/store/useTaleStore");
    useTaleStore.setState({ id: "t1" });
    sendRoleChat.mockResolvedValueOnce(streamed([{ content: "Ok." }]));
    session.startNewAssistantChat("/play");
    await session.sendAssistantMessage("Hi", { getPathname: () => "/play" });
    expect(db.threads[0].taleId).toBe("t1");
    expect(store.getState().taleId).toBe("t1");
  });
  describe("asking the player with buttons", () => {
    const deleteCall: StreamChunk[] = [
      {
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "library", arguments: '{"action":"delete"}' },
          },
        ],
      },
    ];

    async function waitingCard() {
      const { session, store } = await load();
      sendRoleChat
        .mockResolvedValueOnce(streamed(deleteCall))
        .mockResolvedValueOnce(streamed([{ content: "Done." }]));
      const sending = session.sendAssistantMessage("Delete Mara", home);
      await vi.waitFor(() =>
        expect(store.getState().run?.activity[0]?.confirm).toEqual({
          action: "delete_tales",
          names: ["Mara"],
        }),
      );
      return { session, store, sending };
    }

    it("goes ahead when the player says yes", async () => {
      const { session, store, sending } = await waitingCard();
      session.answerAssistantConfirm(true);
      await sending;
      const reply = store.getState().messages.at(-1)!;
      expect(reply.activity?.[0].confirm?.answer).toBe("yes");
      expect(JSON.parse(reply.turn![1].content)).toEqual({ deleted: ["Mara"] });
    });

    it("tells the model when the player cancels", async () => {
      const { session, store, sending } = await waitingCard();
      session.answerAssistantConfirm(false);
      await sending;
      const reply = store.getState().messages.at(-1)!;
      expect(reply.activity?.[0].confirm?.answer).toBe("no");
      expect(JSON.parse(reply.turn![1].content)).toEqual({
        done: false,
        cancelled: true,
      });
    });

    it("answers no and stops when the player presses Stop", async () => {
      const { session, store, sending } = await waitingCard();
      session.stopAssistant();
      await sending;
      const reply = store.getState().messages.at(-1)!;
      expect(reply).toMatchObject({ status: "stopped" });
      expect(reply.activity?.[0].confirm?.answer).toBe("no");
    });
  });

  it("records changes a tool left for after the reply, on that tool's step", async () => {
    const { session, store } = await load();
    sendRoleChat
      .mockResolvedValueOnce(
        streamed([
          {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "ai_setup", arguments: '{"action":"set"}' },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamed([{ content: "Switched." }]));
    await session.sendAssistantMessage("Switch yourself", home);
    const reply = store.getState().messages.at(-1)!;
    expect(reply.changes).toEqual([
      expect.objectContaining({ kind: "setting", key: "theme" }),
    ]);
    expect(reply.activity).toEqual([
      { tool: "ai_setup", action: "set", at: 0, changed: true },
    ]);
  });
});
