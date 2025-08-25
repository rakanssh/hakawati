import { useCallback, useState } from "react";
import {
  saveScenarioFromStore,
  loadScenarioIntoStore,
} from "@/services/scenario.service";

export function useSaveScenario() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(async (id?: string) => {
    setSaving(true);
    setError(null);
    try {
      return await saveScenarioFromStore(id);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error } as const;
}

export function useLoadScenario() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await loadScenarioIntoStore(id);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error } as const;
}
