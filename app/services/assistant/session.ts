import { nanoid } from "nanoid";
import {
  appendAssistantMessage,
  createAssistantThread,
  updateAssistantMessageChanges,
  deleteAssistantThread,
  getLatestAssistantThread,
  listAssistantMessages,
  listAssistantThreads,
} from "@/repositories/assistant.repository";
import { resolveModelRole } from "@/services/llm";
import type { ChatMessage } from "@/services/llm/schema";
import {
  useAssistantStore,
  type AssistantRun,
} from "@/store/useAssistantStore";
import type {
  AssistantMessage,
  AssistantMessageStatus,
  AssistantModelMessage,
  AssistantThread,
  ScenarioChange,
  TaleChange,
} from "@/types/assistant.type";
import { runAgentLoop, type AgentEvent } from "./agent-loop";
import { clip, openTaleId, workspaceContext } from "./context";
import { toModelHistory } from "./history";
import {
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_NAMESPACE,
  withContext,
} from "./prompt";
import type { AssistantTool, AssistantToolContext } from "./tools/define";
import { createReadTools } from "./tools/read";
import { createTaleTools } from "./tools/tale";
import { revertScenarioChanges } from "./scenario-edits";
import { revertChanges } from "./tale-edits";
import { createScenarioTools } from "./tools/scenario";

const store = useAssistantStore;
let controller: AbortController | null = null;
let showToken = 0;
let started = false;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function showThread(
  thread: AssistantThread | null,
  taleId: string | null,
): Promise<void> {
  const token = ++showToken;
  const messages = thread ? await listAssistantMessages(thread.id) : [];
  if (token !== showToken || store.getState().run) return;
  store.setState({
    threadId: thread?.id ?? null,
    taleId: thread ? thread.taleId : taleId,
    messages,
    error: null,
  });
}

/** Loads the chats once, then switches to a tale's latest chat when the player opens that tale. */
export async function syncAssistantScope(playTaleId: string | null) {
  try {
    if (!store.getState().loaded) {
      const threads = await listAssistantThreads();
      store.setState({ threads, loaded: true });
    }
    const state = store.getState();
    if (state.run) return;
    if (playTaleId) {
      if (state.taleId === playTaleId && started) return;
      started = true;
      await showThread(await getLatestAssistantThread(playTaleId), playTaleId);
    } else if (!started) {
      started = true;
      await showThread(await getLatestAssistantThread(), null);
    }
  } catch (error) {
    store.setState({ error: errorText(error), loaded: true });
  }
}

export function startNewAssistantChat(pathname: string) {
  if (store.getState().run) return;
  showToken += 1;
  store.setState({
    threadId: null,
    taleId: openTaleId(pathname),
    messages: [],
    error: null,
  });
}

export async function selectAssistantThread(id: string) {
  const thread = store.getState().threads.find((t) => t.id === id);
  if (!thread || store.getState().run) return;
  await showThread(thread, thread.taleId);
}

export async function removeAssistantThread(id: string, pathname: string) {
  if (store.getState().run) return;
  await deleteAssistantThread(id);
  store.setState((state) => ({
    threads: state.threads.filter((thread) => thread.id !== id),
  }));
  if (store.getState().threadId === id) startNewAssistantChat(pathname);
}

export function stopAssistant() {
  controller?.abort();
}

function toolDetail(tool: AssistantTool | undefined, args: string) {
  if (!tool?.detail) return undefined;
  try {
    const parsed: unknown = JSON.parse(args || "{}");
    return parsed && typeof parsed === "object"
      ? tool.detail(parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function toStored(messages: ChatMessage[]): AssistantModelMessage[] {
  return messages.flatMap((message): AssistantModelMessage[] =>
    message.role === "assistant" || message.role === "tool"
      ? [
          {
            role: message.role,
            content: message.content,
            ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
            ...(message.tool_call_id
              ? { tool_call_id: message.tool_call_id }
              : {}),
            ...(message.replay ? { replay: message.replay } : {}),
          },
        ]
      : [],
  );
}

async function ensureThread(
  content: string,
  pathname: string,
): Promise<string> {
  const current = store.getState().threadId;
  if (current) return current;
  const now = Date.now();
  const thread: AssistantThread = {
    id: nanoid(),
    taleId: openTaleId(pathname),
    title: clip(content.split("\n")[0].trim(), 60),
    createdAt: now,
    updatedAt: now,
  };
  await createAssistantThread(thread);
  store.setState((state) => ({
    threadId: thread.id,
    taleId: thread.taleId,
    threads: [thread, ...state.threads],
  }));
  return thread.id;
}

function touchThread(threadId: string, updatedAt: number) {
  store.setState((state) => {
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return {};
    return {
      threads: [
        { ...thread, updatedAt },
        ...state.threads.filter((t) => t.id !== threadId),
      ],
    };
  });
}

export async function sendAssistantMessage(
  text: string,
  options: {
    getPathname: () => string;
    openTale?: (taleId: string) => Promise<void>;
  },
) {
  const content = text.trim();
  if (!content || store.getState().run) return;
  const pathname = options.getPathname();
  const run: AssistantRun = {
    content: "",
    thinking: "",
    activity: [],
    changes: [],
    toolRunning: false,
  };
  store.setState({ draft: "", error: null, run: { ...run } });

  let threadId: string;
  try {
    threadId = await ensureThread(content, pathname);
    const user = await appendAssistantMessage({
      id: nanoid(),
      threadId,
      role: "user",
      content,
      createdAt: Date.now(),
    });
    store.setState((state) => ({ messages: [...state.messages, user] }));
  } catch (error) {
    store.setState({ run: null, error: errorText(error), draft: content });
    return;
  }

  const history = toModelHistory(store.getState().messages);
  history[history.length - 1] = {
    role: "user",
    content: withContext(content, workspaceContext(pathname)),
  };
  const publish = () =>
    store.setState({
      run: {
        ...run,
        activity: run.activity.map((step) => ({ ...step })),
        changes: [...run.changes],
      },
    });
  const context: AssistantToolContext = {
    getPathname: options.getPathname,
    openTale: options.openTale,
    recordChanges: (changes) => {
      run.changes.push(...changes);
      publish();
    },
  };
  const tools = [
    ...createReadTools(context),
    ...createTaleTools(context),
    ...createScenarioTools(context),
  ];
  const byName = new Map(tools.map((t) => [t.definition.function.name, t]));
  let afterTools = false;
  const onEvent = (event: AgentEvent) => {
    if (event.type === "text") {
      if (afterTools && run.content && !run.content.endsWith("\n\n"))
        run.content += "\n\n";
      afterTools = false;
      run.content += event.delta;
    } else if (event.type === "thinking") {
      run.thinking += event.delta;
    } else if (event.type === "tool_start") {
      afterTools = true;
      run.toolRunning = true;
      const name = event.call.function.name;
      const detail = toolDetail(
        byName.get(name),
        event.call.function.arguments,
      );
      run.activity.push({
        tool: name,
        at: run.content.length,
        ...(detail ? { detail } : {}),
      });
    } else {
      run.toolRunning = false;
      const last = run.activity.at(-1);
      if (last && event.error) last.error = event.error;
      const outcome = event.error
        ? undefined
        : byName.get(event.call.function.name)?.outcome?.(event.output);
      if (last && outcome) last.detail = outcome;
    }
    publish();
  };

  controller = new AbortController();
  const signal = controller.signal;
  let turn: ChatMessage[] | undefined;
  let status: AssistantMessageStatus | undefined;
  let error: string | null = null;
  try {
    const { model } = resolveModelRole("hakawati");
    const result = await runAgentLoop({
      role: "hakawati",
      messages: [
        { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
        ...history,
      ],
      tools,
      toolNamespace: ASSISTANT_TOOL_NAMESPACE,
      maxTokens: Math.min(model.maxOutputTokens ?? 4096, 8192),
      signal,
      onEvent,
    });
    turn = result.messages;
  } catch (failure) {
    if (signal.aborted) status = "stopped";
    else {
      status = "failed";
      error = errorText(failure);
    }
  } finally {
    controller = null;
  }

  const replyText = run.content.trim();
  const lead = run.content.length - run.content.trimStart().length;
  const activity = run.activity.map((step) => ({
    ...step,
    at: Math.min(replyText.length, Math.max(0, (step.at ?? 0) - lead)),
  }));
  const reply: Omit<AssistantMessage, "seq"> = {
    id: nanoid(),
    threadId,
    role: "assistant",
    content: replyText,
    ...(run.thinking.trim() ? { thinking: run.thinking.trim() } : {}),
    ...(turn ? { turn: toStored(turn) } : {}),
    ...(activity.length ? { activity } : {}),
    ...(run.changes.length ? { changes: run.changes } : {}),
    ...(status ? { status } : {}),
    createdAt: Date.now(),
  };
  try {
    const saved = await appendAssistantMessage(reply);
    touchThread(threadId, saved.createdAt);
    store.setState((state) => ({
      messages:
        state.threadId === threadId
          ? [...state.messages, saved]
          : state.messages,
      run: null,
      error,
    }));
  } catch (saveError) {
    store.setState({ run: null, error: error ?? errorText(saveError) });
  }
}

/** Undoes the changes a reply made; any changed again since are kept. Returns how many were kept. */
export async function undoAssistantReply(messageId: string): Promise<number> {
  const state = store.getState();
  const message = state.messages.find((m) => m.id === messageId);
  if (!message?.changes?.length || state.run || state.undoingId) return 0;
  store.setState({ undoingId: messageId, error: null });
  try {
    const all = message.changes;
    const taleChanges = all.filter(
      (change): change is TaleChange => change.kind !== "scenario",
    );
    const scenarioChanges = all.filter(
      (change): change is ScenarioChange => change.kind === "scenario",
    );
    const scenarios = scenarioChanges.length
      ? await revertScenarioChanges(scenarioChanges)
      : { changes: [], kept: 0 };
    const tales = taleChanges.length ? await revertChanges(taleChanges) : [];
    const queues = { tale: [...tales], scenario: [...scenarios.changes] };
    const changes = all.map(
      (change) =>
        (change.kind === "scenario" ? queues.scenario : queues.tale).shift()!,
    );
    await updateAssistantMessageChanges(messageId, changes);
    store.setState((current) => ({
      messages: current.messages.map((m) =>
        m.id === messageId ? { ...m, changes } : m,
      ),
    }));
    return tales.filter((change) => !change.undone).length + scenarios.kept;
  } catch (error) {
    store.setState({ error: errorText(error) });
    return 0;
  } finally {
    store.setState({ undoingId: null });
  }
}
