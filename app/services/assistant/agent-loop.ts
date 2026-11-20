import {
  lowerRoleReasoningEffort,
  resolveModelRole,
  sendRoleChat,
} from "@/services/llm";
import { errorMessage, isAbortError, isOutputLimitError } from "@/lib/errors";
import { assertNotAborted } from "@/services/llm/adapters/responses";
import type {
  ChatMessage,
  ChatResponse,
  ToolNamespace,
} from "@/services/llm/schema";
import { ToolCallAccumulator } from "@/services/llm/tool-call-accumulator";
import type { ToolCall, ToolDefinition } from "@/services/llm/tools";
import { countTokens } from "@/services/llm/tokenCounter";
import { ResponseMode, type ModelRole } from "@/types/api.type";
import type { ReasoningEffort } from "@/types/model.type";
import { OMITTED_RESULT } from "./history";

const DEFAULT_MAX_AGENT_ROUNDS = 50;
const CUT_OFF_RETRIES = 2;
const CUT_OFF_NOTE =
  "Your last response reached the output limit before it finished, and none of it was kept. Think briefly and do less in this step: make one smaller call now and the rest in later calls.";
const KEPT_RESULTS = 4;
const CONTEXT_FILL = 0.8;
const MESSAGE_OVERHEAD_TOKENS = 4;

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
  | { type: "discard" }
  | { type: "tool_start"; call: ToolCall; args: Record<string, unknown> }
  | { type: "tool_end"; call: ToolCall; output: unknown; error?: string };

export interface AgentRunResult {
  messages: ChatMessage[];
  stopReason: "done" | AgentStop;
}

export type AgentStop = "max_rounds" | "output_limit";

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

function parseArgs(
  call: ToolCall,
): { args: Record<string, unknown> } | { error: string } {
  let args: unknown;
  try {
    args = call.function.arguments.trim()
      ? JSON.parse(call.function.arguments)
      : {};
  } catch {
    return { error: "Arguments were not valid JSON." };
  }
  return args && typeof args === "object" && !Array.isArray(args)
    ? { args: args as Record<string, unknown> }
    : { error: "Arguments must be a JSON object." };
}

async function runTool(
  call: ToolCall,
  parsed: ReturnType<typeof parseArgs>,
  tools: Map<string, AgentTool>,
  signal: AbortSignal | undefined,
): Promise<{ output: unknown; error?: string }> {
  const fail = (error: string) => ({ output: { error }, error });
  const tool = tools.get(call.function.name);
  if (!tool) return fail(`Unknown tool: ${call.function.name}`);
  if ("error" in parsed) return fail(parsed.error);
  try {
    return { output: await tool.run(parsed.args, signal) };
  } catch (error) {
    if (isAbortError(error)) throw error;
    assertNotAborted(signal);
    return fail(errorMessage(error));
  }
}

const messageSizes = new WeakMap<ChatMessage, number>();

function messageTokens(message: ChatMessage): number {
  let size = messageSizes.get(message);
  if (size === undefined) {
    size =
      MESSAGE_OVERHEAD_TOKENS +
      countTokens(message.content) +
      (message.tool_calls ?? []).reduce(
        (sum, call) =>
          sum +
          countTokens(call.function.name) +
          countTokens(call.function.arguments),
        0,
      );
    messageSizes.set(message, size);
  }
  return size;
}

function fitContext(conversation: ChatMessage[], budget: number) {
  let total = conversation.reduce(
    (sum, message) => sum + messageTokens(message),
    0,
  );
  if (total <= budget) return;
  const results = conversation.flatMap((message, index) =>
    message.role === "tool" && message.content !== OMITTED_RESULT
      ? [index]
      : [],
  );
  for (const index of results.slice(0, -KEPT_RESULTS)) {
    if (total <= budget) return;
    const trimmed = { ...conversation[index], content: OMITTED_RESULT };
    total += messageTokens(trimmed) - messageTokens(conversation[index]);
    conversation[index] = trimmed;
  }
}

export async function runAgentLoop(input: {
  role: ModelRole;
  messages: ChatMessage[];
  tools: AgentTool[];
  toolNamespace?: ToolNamespace;
  maxRounds?: number;
  maxTokens?: number;
  contextLength?: number;
  wrapUp?: Record<AgentStop, string>;
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
  const budget = input.contextLength
    ? Math.floor(
        (input.contextLength -
          (input.maxTokens ?? 0) -
          countTokens(JSON.stringify(definitions))) *
          CONTEXT_FILL,
      )
    : undefined;
  let effort: ReasoningEffort | undefined;
  const send = (messages: ChatMessage[], toolChoice?: "none") => {
    if (budget !== undefined) fitContext(messages, budget);
    return sendRoleChat(
      role,
      {
        model: model.id,
        messages: [...messages],
        stream: true,
        ...(input.maxTokens !== undefined
          ? { max_tokens: input.maxTokens }
          : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
        responseMode: ResponseMode.TOOL_CALLING,
        tools: definitions,
        ...(toolChoice ? { toolChoice } : {}),
        ...(input.toolNamespace ? { toolNamespace: input.toolNamespace } : {}),
      },
      signal,
    );
  };

  const attempt = async (round: number) => {
    for (let retries = 0; ; retries += 1) {
      try {
        const response = await send(
          retries
            ? [...conversation, { role: "user", content: CUT_OFF_NOTE }]
            : conversation,
        );
        return { response, ...(await readRound(response, round, onEvent)) };
      } catch (error) {
        if (!isOutputLimitError(error)) throw error;
        assertNotAborted(signal);
        onEvent?.({ type: "discard" });
        if (retries === CUT_OFF_RETRIES) return null;
        effort = lowerRoleReasoningEffort(role, effort) ?? effort;
      }
    }
  };

  let stopReason: AgentStop = "max_rounds";
  for (let round = 0; round < maxRounds; round += 1) {
    assertNotAborted(signal);
    const reply = await attempt(round);
    if (!reply) {
      stopReason = "output_limit";
      break;
    }
    const { response, content, toolCalls } = reply;
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
      const parsed = parseArgs(call);
      onEvent?.({
        type: "tool_start",
        call,
        args: "args" in parsed ? parsed.args : {},
      });
      const { output, error } = await runTool(call, parsed, tools, signal);
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
  if (input.wrapUp) {
    try {
      const response = await send(
        [...conversation, { role: "user", content: input.wrapUp[stopReason] }],
        "none",
      );
      const { content, toolCalls } = await readRound(
        response,
        maxRounds,
        onEvent,
      );
      if (content)
        added.push({
          role: "assistant",
          content,
          ...(response.replay && !toolCalls.length
            ? { replay: response.replay }
            : {}),
        });
    } catch (error) {
      if (isAbortError(error)) throw error;
      assertNotAborted(signal);
      onEvent?.({ type: "discard" });
    }
  }
  return { messages: added, stopReason };
}
