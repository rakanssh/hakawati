import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantMemoryStoreType {
  /** The chat open most recently, wherever it was. */
  lastThreadId: string | null;
  /** The chat open most recently while each tale was on the play screen. */
  taleThreads: Record<string, string>;
  remember: (threadId: string, taleId: string | null) => void;
  forgetThread: (threadId: string) => void;
  forgetTale: (taleId: string) => void;
}

/** Which Hakawati chat the player was on, so coming back shows it again. */
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
