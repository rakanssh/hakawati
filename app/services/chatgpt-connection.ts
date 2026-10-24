import {
  getChatGptSession,
  signInWithChatGpt,
  signOutOfChatGpt,
  subscribeChatGptSession,
} from "@/services/chatgpt";
import { useChatGptStore } from "@/store/useChatGptStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { ChatGptSession } from "@/types/chatgpt.type";

let sessionRequest = 0;
let signInController: AbortController | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applySession(session: ChatGptSession) {
  const accountId =
    session.connected && session.planUsageEnabled
      ? (session.account?.id ?? null)
      : null;
  if (useSettingsStore.getState().chatGptProfileId !== accountId) {
    useSettingsStore.getState().clearChatGptModels(accountId);
  }
  useChatGptStore.setState({ session });
}

export async function loadChatGptSession(
  options: { preserveError?: boolean } = {},
): Promise<void> {
  const request = ++sessionRequest;
  useChatGptStore.setState({ loading: true });
  try {
    const session = await getChatGptSession();
    if (request !== sessionRequest) return;
    applySession(session);
    if (!options.preserveError) useChatGptStore.setState({ error: null });
  } catch (error) {
    if (
      request === sessionRequest &&
      (!options.preserveError || !useChatGptStore.getState().error)
    ) {
      useChatGptStore.setState({ error: errorMessage(error) });
    }
  } finally {
    if (request === sessionRequest) {
      useChatGptStore.setState({ loading: false });
    }
  }
}

export async function connectChatGpt(): Promise<void> {
  if (useChatGptStore.getState().busy) return;
  ++sessionRequest;
  const controller = new AbortController();
  signInController = controller;
  useChatGptStore.setState({
    busy: "signIn",
    loading: false,
    error: null,
    revocationUnconfirmed: false,
  });
  try {
    const session = await signInWithChatGpt({
      signal: controller.signal,
    });
    // The mutation already returns its committed session. A separate metadata
    // read could fail or overwrite it with an older account snapshot.
    ++sessionRequest;
    applySession(session);
    useChatGptStore.setState({ loading: false, error: null });
    if (
      session.planUsageEnabled &&
      !useSettingsStore.getState().chatGptPlanNoticeAcknowledged
    ) {
      useChatGptStore.setState({ showPlanNotice: true });
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      useChatGptStore.setState({ error: errorMessage(error) });
    }
  } finally {
    signInController = null;
    useChatGptStore.setState({ busy: null });
  }
}

export function cancelChatGptConnect(): void {
  signInController?.abort();
}

export async function disconnectChatGpt(): Promise<void> {
  if (useChatGptStore.getState().busy) return;
  ++sessionRequest;
  useChatGptStore.setState({ busy: "signOut", loading: false, error: null });
  try {
    const result = await signOutOfChatGpt();
    ++sessionRequest;
    const session = useChatGptStore.getState().session;
    if (session) {
      applySession({
        ...session,
        connected: false,
        planUsageEnabled: false,
        account: null,
      });
    } else {
      useSettingsStore.getState().clearChatGptModels();
    }
    useChatGptStore.setState({
      loading: false,
      error: null,
      revocationUnconfirmed: !result.remoteRevocationConfirmed,
    });
  } catch (error) {
    useChatGptStore.setState({ error: errorMessage(error) });
  } finally {
    useChatGptStore.setState({ busy: null });
  }
}

export function dismissChatGptPlanNotice(): void {
  useSettingsStore.getState().acknowledgeChatGptPlanNotice();
  useChatGptStore.setState({ showPlanNotice: false });
}

subscribeChatGptSession(() => void loadChatGptSession({ preserveError: true }));
