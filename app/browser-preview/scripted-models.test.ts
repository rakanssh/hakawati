import { describe, expect, it } from "vitest";
import { parseOpenAIStream } from "@/services/llm/streaming";
import { ToolCallAccumulator } from "@/services/llm/tool-call-accumulator";
import { scriptedChatCompletion } from "./scripted-models";

const assistantTools = [{ function: { name: "get_context" } }];

async function read(response: Response) {
  let content = "";
  const calls = new ToolCallAccumulator();
  for await (const chunk of parseOpenAIStream(response.body!)) {
    content += chunk.content ?? "";
    calls.add(chunk.tool_calls);
  }
  return { content, calls: calls.result().calls };
}

describe("browser preview scripted models", () => {
  it("narrates when Hakawati's tools are not offered", async () => {
    const { content } = await read(
      scriptedChatCompletion({
        stream: true,
        messages: [{ role: "user", content: "/tool get_context {}" }],
      }),
    );
    expect(content).toContain("Scripted browser preview response");
  });

  it("calls the tools named in the player's message, split across chunks", async () => {
    const { content, calls } = await read(
      scriptedChatCompletion({
        stream: true,
        tools: assistantTools,
        messages: [
          {
            role: "user",
            content:
              '<context>\n{"page":"home"}\n</context>\n\n/tool list_library {"kind":"tales"}\n/tool get_context',
          },
        ],
      }),
    );
    expect(content).toBe("Looking.");
    expect(calls.map((call) => call.function)).toEqual([
      { name: "list_library", arguments: '{"kind":"tales"}' },
      { name: "get_context", arguments: "{}" },
    ]);
  });

  it("answers after tool results with what the tools returned", async () => {
    const { content, calls } = await read(
      scriptedChatCompletion({
        stream: true,
        tools: assistantTools,
        messages: [
          { role: "user", content: "/tool get_context" },
          { role: "assistant", content: "" },
          { role: "tool", tool_call_id: "c", content: '{"page":"home"}' },
        ],
      }),
    );
    expect(calls).toEqual([]);
    expect(content).toContain('{"page":"home"}');
  });

  it("keeps calling the tools on /loop until tools are turned off", async () => {
    const messages = [
      { role: "user", content: "/loop\n/tool get_context" },
      { role: "assistant", content: "" },
      { role: "tool", tool_call_id: "c", content: "{}" },
    ];
    const again = await read(
      scriptedChatCompletion({ stream: true, tools: assistantTools, messages }),
    );
    expect(again.calls.map((call) => call.function.name)).toEqual([
      "get_context",
    ]);
    const done = await read(
      scriptedChatCompletion({
        stream: true,
        tools: assistantTools,
        tool_choice: "none",
        messages: [...messages, { role: "user", content: "Wrap up." }],
      }),
    );
    expect(done.calls).toEqual([]);
    expect(done.content).toBe("Scripted Hakawati reply.");
  });
});
