import { enqueueLocalOperation } from "@/lib/local-write-queue";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import { getTaleById } from "@/services/tale.service";
import { DEFAULT_WINDOW_SIZE, useTaleStore } from "@/store/useTaleStore";

let openPlayScreens = 0;

// Play edits its tale in memory and saves later, which would overwrite a pull.
export function holdOpenTaleForPlay(): () => void {
  openPlayScreens += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Saves queued by the closing screen land first, so a pull sees them.
    void enqueueLocalOperation(async () => {
      openPlayScreens -= 1;
    }).then(() => wakeSyncBackground());
  };
}

export function isTaleInPlay(taleId: string): boolean {
  if (openPlayScreens === 0) return false;
  const { id, loadingTaleId } = useTaleStore.getState();
  return id === taleId || loadingTaleId === taleId;
}

export async function showPulledTale(taleId: string): Promise<void> {
  if (useTaleStore.getState().id !== taleId) return;
  const tale = await getTaleById(taleId);
  if (!tale || useTaleStore.getState().id !== taleId) return;
  useTaleStore.setState({
    name: tale.name,
    description: tale.description,
    components: tale.components,
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: tale.log,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
    totalLogCount: tale.totalLogCount,
    oldestLoadedIndex: tale.oldestLoadedIndex,
    logWindowSize: DEFAULT_WINDOW_SIZE,
    isLoadingOlderEntries: false,
  });
}
