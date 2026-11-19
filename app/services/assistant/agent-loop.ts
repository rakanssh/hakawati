import { resolveModelRole, sendRoleChat } from "@/services/llm";
import { assertNotAborted } from "@/services/llm/adapters/responses";
import type {
  ChatMessage,
  ChatResponse,
  ToolNamespace,
} from "@/services/llm/schema";
import { ToolCallAccumulator } from "@/services/llm/tool-call-accumulator";
import type { ToolCall, ToolDefinition } from "@/services/llm/tools";
import { ResponseMode, type ModelRole } from "@/types/api.type";

export const DEFAULT_MAX_AGENT_ROUNDS = 10;

export interface AgentTool {
  definition: ToolDefinition;
  run(
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<unknown>;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; call: ToolCall }
  | { type: "tool_end"; call: ToolCall; output: unknown; error?: string };

export interface AgentRunResult {
  messages: ChatMessage[];
  stopReason: "done" | "max_rounds";
}

async function readRound(
  response: ChatResponse,
  round: number,
  onEvent: ((event: AgentEvent) => void) | undefined,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  if (!response.iterator) {
    if (response.thinking)
      onEvent?.({ type: "thinking", delta: response.thinking });
    if (response.content) onEvent?.({ type: "text", delta: response.content });
    return {
      content: response.content,
      toolCalls: response.tool_calls ?? [],
    };
  }
  let content = "";
  const accumulator = new ToolCallAccumulator();
  for await (const chunk of response.iterator) {
    if (chunk.thinking) onEvent?.({ type: "thinking", delta: chunk.thinking });
    if (chunk.content) {
      content += chunk.content;
      onEvent?.({ type: "text", delta: chunk.content });
    }
    accumulator.add(chunk.tool_calls);
  }
  const { calls, incomplete } = accumulator.result();
  const unnamed = incomplete.flatMap((call, index): ToolCall[] =>
    call.name
      ? [
          {
            id: `call_${round}_${index}`,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          },
        ]
      : [],
  );
  const toolCalls = [...calls, ...unnamed];
  return {
    content,
    toolCalls: toolCalls.length ? toolCalls : (response.tool_calls ?? []),
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function runTool(
  call: ToolCall,
  tools: Map<string, AgentTool>,
  signal: AbortSignal | undefined,
): Promise<{ output: unknown; error?: string }> {
  const fail = (error: string) => ({ output: { error }, error });
  const tool = tools.get(call.function.name);
  if (!tool) return fail(`Unknown tool: ${call.function.name}`);
  let args: unknown;
  try {
    args = call.function.arguments.trim()
      ? JSON.parse(call.function.arguments)
      : {};
  } catch {
    return fail("Arguments were not valid JSON.");
  }
  if (!args || typeof args !== "object" || Array.isArray(args))
    return fail("Arguments must be a JSON object.");
  try {
    return { output: await tool.run(args as Record<string, unknown>, signal) };
  } catch (error) {
    if (isAbort(error)) throw error;
    assertNotAborted(signal);
    return fail(error instanceof Error ? error.message : String(error));
  }
}

export async function runAgentLoop(input: {
  role: ModelRole;
  messages: ChatMessage[];
  tools: AgentTool[];
  toolNamespace?: ToolNamespace;
  maxRounds?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const { role, signal, onEvent } = input;
  const { model } = resolveModelRole(role);
  const tools = new Map(
    input.tools.map((tool) => [tool.definition.function.name, tool]),
  );
  const definitions = input.tools.map((tool) => tool.definition);
  const conversation = [...input.messages];
  const added: ChatMessage[] = [];
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_AGENT_ROUNDS;

  for (let round = 0; round < maxRounds; round += 1) {
    assertNotAborted(signal);
    const response = await sendRoleChat(
      role,
      {
        model: model.id,
        messages: [...conversation],
        stream: true,
        ...(input.maxTokens !== undefined
          ? { max_tokens: input.maxTokens }
          : {}),
        responseMode: ResponseMode.TOOL_CALLING,
        tools: definitions,
        ...(input.toolNamespace ? { toolNamespace: input.toolNamespace } : {}),
      },
      signal,
    );
    const { content, toolCalls } = await readRound(response, round, onEvent);
    assertNotAborted(signal);
    const assistant: ChatMessage = {
      role: "assistant",
      content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(response.replay ? { replay: response.replay } : {}),
    };
    conversation.push(assistant);
    added.push(assistant);
    if (!toolCalls.length) return { messages: added, stopReason: "done" };

    for (const call of toolCalls) {
      assertNotAborted(signal);
      onEvent?.({ type: "tool_start", call });
      const { output, error } = await runTool(call, tools, signal);
      onEvent?.({
        type: "tool_end",
        call,
        output,
        ...(error ? { error } : {}),
      });
      const result: ChatMessage = {
        role: "tool",
        tool_call_id: call.id,
        content:
          typeof output === "string" ? output : JSON.stringify(output ?? null),
      };
      conversation.push(result);
      added.push(result);
    }
  }
  return { messages: added, stopReason: "max_rounds" };
}
