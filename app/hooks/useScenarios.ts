import { useCallback, useEffect, useState } from "react";
import {
  listAllScenarios,
  removeScenario,
  saveScenario,
  initTaleFromScenario,
  getScenarioById,
} from "@/services/scenario.service";
import { Scenario } from "@/types/context.type";

export function useScenariosList() {
  const [items, setItems] = useState<
    Array<{ id: string; scenario: Scenario; updatedAt: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAllScenarios();
      setItems(list);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await removeScenario(id);
      await refresh();
    },
    [refresh],
  );

  return { items, loading, error, refresh, remove } as const;
}

export function useScenarioEditor(initial?: Partial<Scenario>) {
  const [scenario, setScenario] = useState<Scenario>({
    id: initial?.id ?? "",
    name: initial?.name ?? "Untitled Scenario",
    initialDescription: initial?.initialDescription ?? "",
    initialAuthorNote: initial?.initialAuthorNote ?? "",
    initialStats: initial?.initialStats ?? [],
    initialInventory: initial?.initialInventory ?? [],
    initialStoryCards: initial?.initialStoryCards ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (id: string) => {
    const loaded = await getScenarioById(id);
    if (loaded) setScenario(loaded);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const id = await saveScenario(scenario, scenario.id || undefined);
      setScenario((s) => ({ ...s, id }));
      return id;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [scenario]);

  const startTale = useCallback(async () => {
    if (!scenario.id) {
      const id = await save();
      return initTaleFromScenario(id);
    }
    return initTaleFromScenario(scenario.id);
  }, [scenario.id, save]);

  return {
    scenario,
    setScenario,
    load,
    save,
    saving,
    error,
    startTale,
  } as const;
}
