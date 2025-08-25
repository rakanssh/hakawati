import { useCallback, useState } from "react";
import { saveScenario, getScenarioById } from "@/services/scenario.service";
import { Scenario } from "@/types/context.type";

export function useSaveScenario(scenario: Scenario) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(
    async (id?: string) => {
      setSaving(true);
      setError(null);
      try {
        return await saveScenario(scenario, id);
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [scenario],
  );

  return { save, saving, error } as const;
}

export function useLoadScenario() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<Scenario | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const s = await getScenarioById(id);
      setData(s);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error, data } as const;
}
