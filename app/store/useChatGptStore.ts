import { create } from "zustand";
import type { ChatGptSession } from "@/types/chatgpt.type";

interface ChatGptState {
  session: ChatGptSession | null;
  loading: boolean;
  busy: "signIn" | "signOut" | null;
  error: string | null;
  revocationUnconfirmed: boolean;
  showPlanNotice: boolean;
}

// Public account metadata only. Credentials and renewal stay in the desktop runtime.
export const useChatGptStore = create<ChatGptState>(() => ({
  session: null,
  loading: false,
  busy: null,
  error: null,
  revocationUnconfirmed: false,
  showPlanNotice: false,
}));
