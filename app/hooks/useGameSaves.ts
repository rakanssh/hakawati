import { useCallback, useState } from "react";
import { persistCurrentTale, getTaleById } from "@/services/tale.service";
import { updateTaleDTO } from "@/types/tale.type";
import { useTaleStore } from "@/store/useTaleStore";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";

export function usePersistTale() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastSaveSuccess, setLastSaveSuccess] = useState(false);

  const save = useCallback(async (taleId: string) => {
    setSaving(true);
    setLastSaveSuccess(false);
    const state = useTaleStore.getState();
    const tale: updateTaleDTO = {
      id: taleId,
      name: state.name,
      description: state.description,
      thumbnail: null,
      authorNote: state.authorNote,
      storyCards: state.storyCards,
      stats: state.stats,
      inventory: state.inventory,
      log: state.log,
      gameMode: state.gameMode,
      undoStack: state.undoStack,
    };
    setError(null);
    try {
      await persistCurrentTale({
        id: taleId,
        tale,
        oldestLoadedIndex: state.oldestLoadedIndex,
        totalLogCount: state.totalLogCount,
      });
      setLastSaveSuccess(true);
      setTimeout(() => setLastSaveSuccess(false), 2000);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error, lastSaveSuccess } as const;
}

export function useLoadTale() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (taleId: string) => {
    setLoading(true);
    setError(null);
    try {
      useTaleStore.getState().resetLogWindow();

      const tale = await getTaleById(taleId);
      if (!tale) throw new Error("Tale not found");
      useTaleStore.setState({
        id: tale.id,
        name: tale.name,
        description: tale.description,
        authorNote: tale.authorNote,
        storyCards: tale.storyCards,
        stats: tale.stats,
        inventory: tale.inventory,
        log: tale.log,
        gameMode: tale.gameMode,
        undoStack: tale.undoStack,
        totalLogCount: tale.totalLogCount,
        oldestLoadedIndex: tale.oldestLoadedIndex,
        logWindowSize: tale.log.length < 200 ? tale.log.length : 200,
      });

      useLastPlayedStore.getState().setLastPlayedTaleId(taleId);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error } as const;
}
