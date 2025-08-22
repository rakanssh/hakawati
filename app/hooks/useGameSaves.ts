import { useCallback, useState } from "react";
import {
  createGameSave,
  updateGameSave,
  loadSaveIntoGame,
  getSavesForScenario,
  getAllSaves,
} from "@/services/save.service";

export function useCreateGameSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (scenarioId: string, saveName: string) => {
    setSaving(true);
    setError(null);
    try {
      return await createGameSave(scenarioId, saveName);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error } as const;
}

export function useUpdateGameSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (saveName: string) => {
    setSaving(true);
    setError(null);
    try {
      await updateGameSave(saveName);
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

export function useGetSaves(page: number, limit: number, scenarioId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const getSaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      return scenarioId
        ? await getSavesForScenario(scenarioId, page, limit)
        : await getAllSaves(page, limit);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [page, limit, scenarioId]);

  return { getSaves, loading, error } as const;
}
