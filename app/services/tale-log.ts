import { toast } from "sonner";
import { getLogEntries } from "@/repositories/tale.repository";
import { useTaleStore } from "@/store/useTaleStore";

let olderEntriesRequest = 0;

export async function loadOlderLogEntries(count: number): Promise<void> {
  const state = useTaleStore.getState();

  if (state.isLoadingOlderEntries || state.oldestLoadedIndex === 0) {
    return;
  }

  const request = ++olderEntriesRequest;
  useTaleStore.setState({ isLoadingOlderEntries: true });

  try {
    const startIndex = Math.max(0, state.oldestLoadedIndex - count);
    const entriesToLoad = state.oldestLoadedIndex - startIndex;

    if (entriesToLoad === 0) {
      return;
    }

    const entries = await getLogEntries(state.id, startIndex, entriesToLoad);

    const currentState = useTaleStore.getState();
    if (
      request !== olderEntriesRequest ||
      currentState.id !== state.id ||
      !currentState.isLoadingOlderEntries ||
      currentState.oldestLoadedIndex !== state.oldestLoadedIndex
    ) {
      return;
    }

    useTaleStore.setState({
      log: [...entries, ...currentState.log],
      oldestLoadedIndex: startIndex,
    });
  } catch (error) {
    if (
      request !== olderEntriesRequest ||
      useTaleStore.getState().id !== state.id
    )
      return;
    console.error("Failed to load older entries:", error);
    toast.error("Failed to load older entries. Please try again.");
  } finally {
    if (
      request === olderEntriesRequest &&
      useTaleStore.getState().id === state.id
    ) {
      useTaleStore.setState({ isLoadingOlderEntries: false });
    }
  }
}

export async function ensureLogEntriesLoaded(minCount: number): Promise<void> {
  const state = useTaleStore.getState();

  const needed = minCount - state.log.length;

  if (needed > 0 && state.oldestLoadedIndex > 0) {
    await loadOlderLogEntries(needed);
  }
}
