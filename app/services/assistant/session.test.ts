import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResponse, StreamChunk } from "@/services/llm/schema";
import type { AssistantMessage, AssistantThread } from "@/types/assistant.type";

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
    expect(reply.activity).toEqual([{ tool: "get_context" }]);
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
      run: { content: "", thinking: "", activity: [], changes: [] },
    });
    await session.syncAssistantScope("t1");
    expect(store.getState().threadId).toBeNull();
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
    expect(reply.activity).toEqual([{ tool: "edit_story_cards" }]);

    expect(await session.undoAssistantReply(reply.id)).toBe(0);
    expect(store.getState().messages.at(-1)!.changes).toEqual([
      { ...cardChange, undone: true },
    ]);
    expect(db.messages.at(-1)!.changes?.[0].undone).toBe(true);
    expect(store.getState().undoingId).toBeNull();
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
});
