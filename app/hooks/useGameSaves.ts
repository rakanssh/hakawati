import { useCallback, useState } from "react";
import {
  initTale,
  persistCurrentTale,
  loadTaleIntoGame,
  getTalesForScenario,
  getAllTales,
} from "@/services/tale.service";

export function useInitTale() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (scenarioId: string) => {
    setSaving(true);
    setError(null);
    try {
      return await initTale(scenarioId, null);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error } as const;
}

export function usePersistTale() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (taleId: string) => {
    setSaving(true);
    setError(null);
    try {
      await persistCurrentTale(taleId);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error } as const;
}

export function useLoadTale() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (taleId: string) => {
    setLoading(true);
    setError(null);
    try {
      await loadTaleIntoGame(taleId);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error } as const;
}

export function useGetTales(page: number, limit: number, scenarioId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const getTales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      return scenarioId
        ? await getTalesForScenario(scenarioId, page, limit)
        : await getAllTales(page, limit);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [page, limit, scenarioId]);

  return { getTales, loading, error } as const;
}
