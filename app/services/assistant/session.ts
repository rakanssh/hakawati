import { nanoid } from "nanoid";
import { abortError, errorMessage } from "@/lib/errors";
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
import { useAssistantMemoryStore } from "@/store/useAssistantMemoryStore";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";
import {
  isAppChange,
  isScenarioChange,
  isTaleChange,
} from "@/lib/assistant-changes";
import type {
  AssistantActivity,
  AssistantChange,
  AssistantMessage,
  AssistantMessageStatus,
  AssistantModelMessage,
  AssistantThread,
} from "@/types/assistant.type";
import { runAgentLoop, type AgentEvent } from "./agent-loop";
import { clip, openTaleId, workspaceContext } from "./context";
import { toModelHistory } from "./history";
import {
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_NAMESPACE,
  withContext,
} from "./prompt";
import { revertAppChanges } from "./app-changes";
import type { AssistantToolContext, AssistantUi } from "./tools/define";
import { createReadTools } from "./tools/read";
import { createTaleTools } from "./tools/tale";
import { revertScenarioChanges } from "./scenario-edits";
import { revertChanges } from "./tale-edits";
import { createScenarioTools } from "./tools/scenario";
import { createAiSetupTools } from "./tools/ai-setup";
import { createAppTools } from "./tools/app";
import { createCatalogTools } from "./tools/catalog";
import { createLibraryTools } from "./tools/library";

const store = useAssistantStore;
let controller: AbortController | null = null;
let pendingConfirm: ((yes: boolean) => void) | null = null;
let showToken = 0;
/** The tale on the play screen when the chat last looked, or undefined before it first loads. */
let scope: string | null | undefined;

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
  if (thread) rememberChat(thread.id);
}

function rememberChat(threadId: string) {
  useAssistantMemoryStore.getState().remember(threadId, scope ?? null);
}

/**
 * Shows the chat that belongs where the player is. It acts only when the play screen's tale changes,
 * so the chat survives the panel closing or switching tabs. A tale gets the chat last open on it, or
 * its latest; on first load away from play, the chat last open.
 */
export async function syncAssistantScope(playTaleId: string | null) {
  try {
    if (!store.getState().loaded) {
      const threads = await listAssistantThreads();
      store.setState({ threads, loaded: true });
    }
    if (playTaleId === scope) return;
    const first = scope === undefined;
    scope = playTaleId;
    const state = store.getState();
    const memory = useAssistantMemoryStore.getState();
    const known = (id: string | null | undefined) =>
      id ? state.threads.find((thread) => thread.id === id) : undefined;
    if (state.run || (!first && !playTaleId)) {
      if (state.threadId) rememberChat(state.threadId);
      return;
    }
    if (!playTaleId) {
      await showThread(
        known(memory.lastThreadId) ?? (await getLatestAssistantThread()),
        null,
      );
      return;
    }
    const remembered = known(memory.taleThreads[playTaleId]);
    if (
      remembered?.id === state.threadId ||
      (!remembered && !first && state.taleId === playTaleId)
    ) {
      if (state.threadId) rememberChat(state.threadId);
      return;
    }
    await showThread(
      remembered ?? (await getLatestAssistantThread(playTaleId)),
      playTaleId,
    );
  } catch (error) {
    store.setState({ error: errorMessage(error), loaded: true });
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
  useAssistantMemoryStore.getState().forgetThread(id);
  store.setState((state) => ({
    threads: state.threads.filter((thread) => thread.id !== id),
  }));
  if (store.getState().threadId === id) startNewAssistantChat(pathname);
}

export function stopAssistant() {
  controller?.abort();
}

export function answerAssistantConfirm(yes: boolean) {
  const resolve = pendingConfirm;
  pendingConfirm = null;
  resolve?.(yes);
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
  rememberChat(thread.id);
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
    ui?: AssistantUi;
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
    store.setState({ run: null, error: errorMessage(error), draft: content });
    return;
  }

  const history = toModelHistory(store.getState().messages);
  history[history.length - 1] = {
    role: "user",
    content: withContext(content, workspaceContext(pathname)),
  };
  let shown = { activity: run.activity, changes: run.changes };
  const publish = (stepsChanged = true) => {
    if (stepsChanged)
      shown = {
        activity: run.activity.map((step) => ({ ...step })),
        changes: [...run.changes],
      };
    store.setState({ run: { ...run, ...shown } });
  };
  let current: AssistantActivity | undefined;
  controller = new AbortController();
  const signal = controller.signal;
  const afterRun: Array<() => void | Promise<void>> = [];
  const context: AssistantToolContext = {
    getPathname: options.getPathname,
    ui: options.ui,
    recordChanges: (changes) => {
      run.changes.push(...changes);
      if (current) current.changed = true;
      publish();
    },
    afterRun: (task) => {
      const step = current;
      afterRun.push(async () => {
        current = step;
        await task();
      });
    },
    confirm: (request) =>
      new Promise<boolean>((resolve, reject) => {
        const step = current;
        if (!step) return resolve(false);
        const finish = (yes: boolean, stopped = false) => {
          signal.removeEventListener("abort", onAbort);
          if (pendingConfirm === answer) pendingConfirm = null;
          step.confirm = { ...request, answer: yes ? "yes" : "no" };
          publish();
          if (stopped) reject(abortError());
          else resolve(yes);
        };
        const answer = (yes: boolean) => finish(yes);
        const onAbort = () => finish(false, true);
        if (signal.aborted) return onAbort();
        step.confirm = { ...request };
        pendingConfirm = answer;
        signal.addEventListener("abort", onAbort, { once: true });
        useStoryPanelStore.setState({ open: true, tab: "hakawati" });
        publish();
      }),
  };
  const tools = [
    ...createReadTools(context),
    ...createTaleTools(context),
    ...createScenarioTools(context),
    ...createAppTools(context),
    ...createAiSetupTools(context),
    ...createLibraryTools(context),
    ...createCatalogTools(context),
  ];
  const byName = new Map(tools.map((t) => [t.definition.function.name, t]));
  let afterTools = false;
  const onEvent = (event: AgentEvent) => {
    if (event.type === "text") {
      if (afterTools && run.content && !run.content.endsWith("\n\n"))
        run.content += "\n\n";
      afterTools = false;
      run.content += event.delta;
      return publish(false);
    }
    if (event.type === "thinking") {
      run.thinking += event.delta;
      return publish(false);
    }
    const tool = byName.get(event.call.function.name);
    if (event.type === "tool_start") {
      afterTools = true;
      run.toolRunning = true;
      const { args } = event;
      const detail = tool?.detail?.(args);
      current = {
        tool: event.call.function.name,
        at: run.content.length,
        ...(typeof args.action === "string" ? { action: args.action } : {}),
        ...(detail ? { detail } : {}),
      };
      run.activity.push(current);
    } else if (current) {
      run.toolRunning = false;
      if (event.error) current.error = event.error;
      else {
        const result = tool?.outcome?.(event.output);
        if (result) current.result = result;
      }
    }
    publish();
  };

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
      error = errorMessage(failure);
    }
  } finally {
    controller = null;
    pendingConfirm = null;
  }
  for (const task of afterRun) {
    try {
      await task();
    } catch (failure) {
      error ??= errorMessage(failure);
    }
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
    store.setState({ run: null, error: error ?? errorMessage(saveError) });
  }
}

type Reverter = {
  owns: (change: AssistantChange) => boolean;
  revert: (
    changes: AssistantChange[],
  ) => Promise<{ changes: AssistantChange[]; kept: number }>;
};

const REVERTERS: Reverter[] = [
  {
    owns: isAppChange,
    revert: async (changes) => revertAppChanges(changes.filter(isAppChange)),
  },
  {
    owns: isScenarioChange,
    revert: (changes) =>
      revertScenarioChanges(changes.filter(isScenarioChange)),
  },
  {
    owns: isTaleChange,
    revert: async (changes) => {
      const reverted = await revertChanges(changes.filter(isTaleChange));
      return {
        changes: reverted,
        kept: reverted.filter((change) => !change.undone).length,
      };
    },
  },
];

/** Undoes the changes a reply made; any changed again since are kept. Returns how many were kept. */
export async function undoAssistantReply(messageId: string): Promise<number> {
  const state = store.getState();
  const message = state.messages.find((m) => m.id === messageId);
  if (!message?.changes?.length || state.run || state.undoingId) return 0;
  store.setState({ undoingId: messageId, error: null });
  try {
    const all = message.changes;
    const changes = [...all];
    let kept = 0;
    for (const { owns, revert } of REVERTERS) {
      const indexes = all.flatMap((change, index) =>
        owns(change) ? [index] : [],
      );
      if (!indexes.length) continue;
      const result = await revert(indexes.map((index) => all[index]));
      result.changes.forEach((change, i) => (changes[indexes[i]] = change));
      kept += result.kept;
    }
    await updateAssistantMessageChanges(messageId, changes);
    store.setState((current) => ({
      messages: current.messages.map((m) =>
        m.id === messageId ? { ...m, changes } : m,
      ),
    }));
    return kept;
  } catch (error) {
    store.setState({ error: errorMessage(error) });
    return 0;
  } finally {
    store.setState({ undoingId: null });
  }
}
