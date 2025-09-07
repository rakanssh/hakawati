import { useCallback, useEffect, useState } from "react";
import {
  removeScenario,
  saveScenario,
  initTaleFromScenario,
  getScenarioById,
  getAllScenarios,
} from "@/services/scenario.service";
import { GameMode, Scenario, ScenarioHead } from "@/types/context.type";
import { PaginatedResponse } from "@/types/db.type";

export function useScenariosList(initialPage = 1, initialLimit = 12) {
  const [items, setItems] = useState<ScenarioHead[]>([]);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp: PaginatedResponse<ScenarioHead> = await getAllScenarios(
        page,
        limit,
      );
      setItems(resp.data);
      setTotal(resp.total);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

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

  return {
    items,
    page,
    limit,
    total,
    setPage,
    setLimit,
    loading,
    error,
    refresh,
    remove,
  } as const;
}

export function useScenarioEditor(initial?: Partial<Scenario>) {
  const [scenario, setScenario] = useState<Scenario>({
    id: initial?.id ?? "",
    name: initial?.name ?? "Untitled Scenario",
    initialGameMode: initial?.initialGameMode ?? GameMode.STORY_TELLER,
    initialDescription: initial?.initialDescription ?? "",
    initialAuthorNote: initial?.initialAuthorNote ?? "",
    initialStats: initial?.initialStats ?? [],
    initialInventory: initial?.initialInventory ?? [],
    initialStoryCards: initial?.initialStoryCards ?? [],
    thumbnail: initial?.thumbnail ?? null,
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
