import { describe, expect, it } from "vitest";
import type { AssistantMessage } from "@/types/assistant.type";
import { HISTORY_MESSAGES, OMITTED_RESULT, toModelHistory } from "./history";

let seq = 0;
const user = (content: string): AssistantMessage => ({
  id: `u${++seq}`,
  threadId: "t",
  seq,
  role: "user",
  content,
  createdAt: seq,
});
const reply = (
  content: string,
  extra: Partial<AssistantMessage> = {},
): AssistantMessage => ({
  id: `a${++seq}`,
  threadId: "t",
  seq,
  role: "assistant",
  content,
  createdAt: seq,
  ...extra,
});
const withTool = (id: string, result: string) =>
  reply("Done.", {
    turn: [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id,
            type: "function",
            function: { name: "read_log", arguments: "{}" },
          },
        ],
        replay: {
          format: "chat",
          model: "m",
          fields: { reasoning_content: "r" },
        },
      },
      { role: "tool", tool_call_id: id, content: result },
      { role: "assistant", content: "Done." },
    ],
  });

describe("toModelHistory", () => {
  it("replays tool calls and shortens all but the latest tool results", () => {
    const messages = [
      user("1"),
      withTool("c1", "old"),
      user("2"),
      withTool("c2", "r2"),
      user("3"),
      withTool("c3", "r3"),
      user("4"),
      withTool("c4", "r4"),
      user("5"),
    ];
    const history = toModelHistory(messages);
    const tools = history.filter((m) => m.role === "tool");
    expect(tools.map((m) => m.content)).toEqual([
      OMITTED_RESULT,
      "r2",
      "r3",
      "r4",
    ]);
    expect(history[1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "c1" }],
      replay: { format: "chat" },
    });
    expect(history.at(-1)).toEqual({ role: "user", content: "5" });
  });

  it("keeps stopped and failed replies as text and drops empty ones", () => {
    const history = toModelHistory([
      user("a"),
      reply("Partial answer", { status: "stopped", turn: undefined }),
      user("b"),
      reply("", { status: "failed" }),
      user("c"),
    ]);
    expect(history).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "Partial answer" },
      { role: "user", content: "b" },
      { role: "user", content: "c" },
    ]);
  });

  it("keeps only recent messages and starts on a player message", () => {
    const messages = Array.from({ length: HISTORY_MESSAGES + 5 }, (_, i) =>
      i % 2 === 0 ? user(`u${i}`) : reply(`a${i}`),
    );
    const history = toModelHistory(messages);
    expect(history.length).toBeLessThanOrEqual(HISTORY_MESSAGES);
    expect(history[0].role).toBe("user");
  });
});
