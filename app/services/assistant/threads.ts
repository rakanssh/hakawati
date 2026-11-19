import { detachAssistantThread } from "@/repositories/assistant.repository";
import { useAssistantMemoryStore } from "@/store/useAssistantMemoryStore";
import { useAssistantStore } from "@/store/useAssistantStore";

/** A tale's chats are deleted with it. The one open in Hakawati is kept, as a chat about no tale. */
export async function keepOpenChat(taleId: string) {
  const { threadId, threads } = useAssistantStore.getState();
  const open = threads.find(
    (thread) => thread.id === threadId && thread.taleId === taleId,
  );
  if (open) await detachAssistantThread(open.id);
  useAssistantMemoryStore.getState().forgetTale(taleId);
  useAssistantStore.setState((state) => ({
    taleId: state.taleId === taleId ? null : state.taleId,
    threads: state.threads.flatMap((thread) =>
      thread.taleId !== taleId
        ? [thread]
        : thread.id === open?.id
          ? [{ ...thread, taleId: null }]
          : [],
    ),
  }));
}
