import { create } from "zustand";
import type {
  AssistantActivity,
  AssistantChange,
  AssistantMessage,
  AssistantThread,
} from "@/types/assistant.type";

export interface AssistantRun {
  content: string;
  thinking: string;
  activity: AssistantActivity[];
  changes: AssistantChange[];
  toolRunning: boolean;
}

interface AssistantStoreType {
  loaded: boolean;
  threads: AssistantThread[];
  threadId: string | null;
  taleId: string | null;
  messages: AssistantMessage[];
  draft: string;
  draftImages: string[];
  run: AssistantRun | null;
  undoingId: string | null;
  error: string | null;
  focusComposer: boolean;
  setDraft: (draft: string) => void;
  setDraftImages: (images: string[]) => void;
  requestComposerFocus: () => void;
  clearComposerFocus: () => void;
}

export const useAssistantStore = create<AssistantStoreType>()((set) => ({
  loaded: false,
  threads: [],
  threadId: null,
  taleId: null,
  messages: [],
  draft: "",
  draftImages: [],
  run: null,
  undoingId: null,
  error: null,
  focusComposer: false,
  setDraft: (draft) => set({ draft }),
  setDraftImages: (draftImages) => set({ draftImages }),
  requestComposerFocus: () => set({ focusComposer: true }),
  clearComposerFocus: () => set({ focusComposer: false }),
}));
