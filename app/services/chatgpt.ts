import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

export type ChatGptSession = {
  available: boolean;
  connected: boolean;
  planUsageEnabled: boolean;
  account: { id: string; email: string | null } | null;
};

const sessionListeners = new Set<() => void>();

export function subscribeChatGptSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionChanged() {
  for (const listener of sessionListeners) listener();
}

function abortError() {
  return new DOMException("ChatGPT request cancelled", "AbortError");
}

function requireDesktop() {
  if (!isTauri())
    throw new Error("ChatGPT sign-in is available in the desktop app");
}

function serviceError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function getChatGptSession(): Promise<ChatGptSession> {
  if (!isTauri()) {
    return {
      available: false,
      connected: false,
      planUsageEnabled: false,
      account: null,
    };
  }
  return invoke<ChatGptSession>("chatgpt_session");
}

export async function signInWithChatGpt(
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<ChatGptSession> {
  requireDesktop();
  if (options.signal?.aborted) throw abortError();
  const id = await invoke<string>("chatgpt_start_operation");
  const cancel = () => {
    void invoke("chatgpt_cancel_operation", { id }).catch(() => undefined);
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    const session = await invoke<ChatGptSession>("chatgpt_sign_in", {
      id,
    });
    if (options.signal?.aborted) throw abortError();
    return session;
  } catch (error) {
    throw options.signal?.aborted ? abortError() : serviceError(error);
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    notifySessionChanged();
  }
}

export async function signOutOfChatGpt(): Promise<{
  remoteRevocationConfirmed: boolean;
}> {
  requireDesktop();
  try {
    return await invoke("chatgpt_sign_out");
  } catch (error) {
    throw serviceError(error);
  } finally {
    notifySessionChanged();
  }
}

type HttpEvent =
  | { type: "headers"; status: number; headers: Record<string, string> }
  | { type: "chunk"; data: number[] }
  | { type: "end" };

/** Authenticated native transport. URLs, authorization headers and tokens are not
 * accepted here: only the two documented ChatGPT subscription routes are exposed. */
export async function fetchChatGpt(
  path: "/models" | "/responses",
  init: RequestInit = {},
): Promise<Response> {
  requireDesktop();
  if (init.signal?.aborted) throw abortError();
  const method = (init.method ?? "GET").toUpperCase();
  if (
    (path === "/models" && (method !== "GET" || init.body != null)) ||
    (path === "/responses" &&
      (method !== "POST" || typeof init.body !== "string"))
  ) {
    throw new Error("Unsupported ChatGPT inference request");
  }
  const id = await invoke<string>("chatgpt_start_operation");
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  let settled = false;
  let ended = false;
  let cancelled = false;
  let resolveResponse!: (response: Response) => void;
  let rejectResponse!: (error: Error) => void;
  const response = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const cancelNative = () => {
    void invoke("chatgpt_cancel_operation", { id }).catch(() => undefined);
  };
  const finish = () => {
    init.signal?.removeEventListener("abort", abort);
  };
  const fail = (error: Error) => {
    if (!ended) {
      ended = true;
      streamController.error(error);
    }
    if (!settled) {
      settled = true;
      rejectResponse(error);
    }
    finish();
  };
  const abort = () => {
    cancelled = true;
    cancelNative();
    fail(abortError());
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      cancelled = true;
      ended = true;
      finish();
      cancelNative();
    },
  });
  const onEvent = new Channel<HttpEvent>();
  onEvent.onmessage = (event) => {
    if (ended) return;
    if (event.type === "headers") {
      if (settled) return;
      settled = true;
      resolveResponse(
        new Response([204, 205, 304].includes(event.status) ? null : body, {
          status: event.status,
          headers: event.headers,
        }),
      );
    } else if (event.type === "chunk") {
      streamController.enqueue(new Uint8Array(event.data));
    } else {
      ended = true;
      streamController.close();
      if (!settled) {
        settled = true;
        rejectResponse(new Error("ChatGPT returned no response headers"));
      }
      finish();
    }
  };
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  void invoke("chatgpt_request", {
    id,
    path,
    body: init.body ?? null,
    onEvent,
  }).catch((error: unknown) => {
    fail(init.signal?.aborted ? abortError() : serviceError(error));
    if (!cancelled) notifySessionChanged();
  });
  return response;
}
