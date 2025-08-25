import { useCallback, useState } from "react";
import { saveCurrentGame, loadSaveIntoGame } from "@/services/save.service";

export function useSaveGame() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (scenarioId: string, saveName: string) => {
    setSaving(true);
    setError(null);
    try {
      return await saveCurrentGame(scenarioId, saveName);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error } as const;
}

export function useLoadGame() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (saveId: string) => {
    setLoading(true);
    setError(null);
    try {
      await loadSaveIntoGame(saveId);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error } as const;
}
