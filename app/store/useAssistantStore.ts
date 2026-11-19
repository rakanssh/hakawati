import { create } from "zustand";
import type {
  AssistantActivity,
  AssistantMessage,
  AssistantThread,
} from "@/types/assistant.type";

export interface AssistantRun {
  content: string;
  thinking: string;
  activity: AssistantActivity[];
}

interface AssistantStoreType {
  loaded: boolean;
  threads: AssistantThread[];
  threadId: string | null;
  /** The tale the shown chat belongs to, or that a new chat will belong to. */
  taleId: string | null;
  messages: AssistantMessage[];
  draft: string;
  run: AssistantRun | null;
  error: string | null;
  setDraft: (draft: string) => void;
}

export const useAssistantStore = create<AssistantStoreType>()((set) => ({
  loaded: false,
  threads: [],
  threadId: null,
  taleId: null,
  messages: [],
  draft: "",
  run: null,
  error: null,
  setDraft: (draft) => set({ draft }),
}));
