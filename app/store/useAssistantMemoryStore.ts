import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantMemoryStoreType {
  lastThreadId: string | null;
  taleThreads: Record<string, string>;
  remember: (threadId: string, taleId: string | null) => void;
  forgetThread: (threadId: string) => void;
  forgetTale: (taleId: string) => void;
}

export const useAssistantMemoryStore = create<AssistantMemoryStoreType>()(
  persist(
    (set) => ({
      lastThreadId: null,
      taleThreads: {},
      remember: (threadId, taleId) =>
        set((state) => ({
          lastThreadId: threadId,
          taleThreads: taleId
            ? { ...state.taleThreads, [taleId]: threadId }
            : state.taleThreads,
        })),
      forgetThread: (threadId) =>
        set((state) => ({
          lastThreadId:
            state.lastThreadId === threadId ? null : state.lastThreadId,
          taleThreads: Object.fromEntries(
            Object.entries(state.taleThreads).filter(
              ([, id]) => id !== threadId,
            ),
          ),
        })),
      forgetTale: (taleId) =>
        set((state) => {
          const { [taleId]: _forgotten, ...taleThreads } = state.taleThreads;
          return { taleThreads };
        }),
    }),
    {
      name: "hakawati-chats",
      partialize: (state) => ({
        lastThreadId: state.lastThreadId,
        taleThreads: state.taleThreads,
      }),
    },
  ),
);
