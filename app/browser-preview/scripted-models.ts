type Message = {
  role: string;
  content?: string | null;
  tool_call_id?: string;
};

type ChatRequest = {
  stream?: boolean;
  messages?: Message[];
  tools?: Array<{ function?: { name?: string } }>;
  tool_choice?: string;
};

type Delta = Record<string, unknown>;

const NARRATION =
  "*Scripted browser preview response.*\n\nThe lantern flickers. Somewhere beyond the doorway, footsteps pause, and a folded note slides across the threshold. You have a moment to decide what to do next.";

let callCount = 0;

function sse(deltas: Delta[], finishReason: string): Response {
  const frames = [
    ...deltas.map((delta) => ({
      choices: [{ index: 0, delta, finish_reason: null }],
    })),
    { choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
  ];
  const body =
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") +
    "data: [DONE]\n\n";
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function reply(request: ChatRequest, content: string): Response {
  if (request.stream) return sse([{ content }], "stop");
  return Response.json({
    choices: [
      { message: { role: "assistant", content }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

const playerText = (content: string) =>
  content.replace(/^<context>[\s\S]*?<\/context>\s*/, "");

/** `/tool name {json}` lines in the player's message; a `/loop` line repeats them every round. */
function requestedCalls(content: string) {
  return playerText(content)
    .split("\n")
    .flatMap((line) => {
      const match = /^\/tool\s+(\w+)\s*(.*)$/.exec(line.trim());
      return match ? [{ name: match[1], args: match[2].trim() || "{}" }] : [];
    });
}

function assistant(request: ChatRequest): Response {
  const messages = request.messages ?? [];
  const last = messages.at(-1);
  const player = String(
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "",
  );
  const loops =
    request.tool_choice !== "none" && /^\/loop$/m.test(playerText(player));
  if (last?.role === "tool" && !loops) {
    const results: string[] = [];
    for (let i = messages.length - 1; messages[i]?.role === "tool"; i -= 1)
      results.unshift(String(messages[i].content ?? "").slice(0, 400));
    return reply(
      request,
      `Scripted Hakawati reply.\n\n${results.map((r) => `- \`${r}\``).join("\n")}`,
    );
  }
  const calls = requestedCalls(player);
  if (!calls.length || !request.stream)
    return reply(request, "Scripted Hakawati reply.");
  callCount += 1;
  const deltas: Delta[] = [{ content: "Looking." }];
  calls.forEach((call, index) => {
    const half = Math.ceil(call.args.length / 2);
    deltas.push(
      {
        tool_calls: [
          {
            index,
            id: `call_${callCount}_${index}`,
            type: "function",
            function: { name: call.name, arguments: "" },
          },
        ],
      },
      {
        tool_calls: [
          { index, function: { arguments: call.args.slice(0, half) } },
        ],
      },
      {
        tool_calls: [{ index, function: { arguments: call.args.slice(half) } }],
      },
    );
  });
  return sse(deltas, "tool_calls");
}

/** The preview's offline models: a scripted narrator, and a Hakawati that calls the tools you name. */
export function scriptedChatCompletion(request: ChatRequest): Response {
  const isAssistant = request.tools?.some(
    (tool) => tool.function?.name === "get_context",
  );
  return isAssistant ? assistant(request) : reply(request, NARRATION);
}
