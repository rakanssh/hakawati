import { create } from "zustand";
import {
  getChatGptSession,
  signInWithChatGpt,
  signOutOfChatGpt,
  subscribeChatGptSession,
  type ChatGptSession,
} from "@/services/chatgpt";
import { useSettingsStore } from "./useSettingsStore";

interface ChatGptState {
  session: ChatGptSession | null;
  loading: boolean;
  busy: "signIn" | "signOut" | null;
  error: string | null;
  revocationUnconfirmed: boolean;
  showPlanNotice: boolean;
  load: (options?: { preserveError?: boolean }) => Promise<void>;
  signIn: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  dismissPlanNotice: () => void;
}

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

// Public account metadata only. Credentials and renewal stay in the desktop runtime.
export const useChatGptStore = create<ChatGptState>((set, get) => ({
  session: null,
  loading: false,
  busy: null,
  error: null,
  revocationUnconfirmed: false,
  showPlanNotice: false,
  load: async (options = {}) => {
    const request = ++sessionRequest;
    set({ loading: true });
    try {
      const session = await getChatGptSession();
      if (request !== sessionRequest) return;
      applySession(session);
      if (!options.preserveError) set({ error: null });
    } catch (error) {
      if (
        request === sessionRequest &&
        (!options.preserveError || !get().error)
      ) {
        set({ error: errorMessage(error) });
      }
    } finally {
      if (request === sessionRequest) set({ loading: false });
    }
  },
  signIn: async () => {
    if (get().busy) return;
    ++sessionRequest;
    const controller = new AbortController();
    signInController = controller;
    set({
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
      set({ loading: false, error: null });
      if (
        session.planUsageEnabled &&
        !useSettingsStore.getState().chatGptPlanNoticeAcknowledged
      ) {
        set({ showPlanNotice: true });
      }
    } catch (error) {
      if (!controller.signal.aborted) set({ error: errorMessage(error) });
    } finally {
      signInController = null;
      set({ busy: null });
    }
  },
  cancelSignIn: () => signInController?.abort(),
  signOut: async () => {
    if (get().busy) return;
    ++sessionRequest;
    set({ busy: "signOut", loading: false, error: null });
    try {
      const result = await signOutOfChatGpt();
      ++sessionRequest;
      const session = get().session;
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
      set({
        loading: false,
        error: null,
        revocationUnconfirmed: !result.remoteRevocationConfirmed,
      });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: null });
    }
  },
  dismissPlanNotice: () => {
    useSettingsStore.getState().acknowledgeChatGptPlanNotice();
    set({ showPlanNotice: false });
  },
}));

subscribeChatGptSession(
  () => void useChatGptStore.getState().load({ preserveError: true }),
);
