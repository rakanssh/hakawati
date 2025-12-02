import { useCallback } from "react";
import {
  getAllTales,
  deleteTaleById,
  saveAsScenario as saveAsScenarioService,
} from "@/services/tale.service";
import { useLoadTale } from "@/hooks/useGameSaves";
import { TaleHead } from "@/types/tale.type";
import { usePaginatedList } from "@/hooks/usePaginatedList";

export function useTalesList(initialPage = 1, initialLimit = 12) {
  const {
    items,
    page,
    limit,
    total,
    setPage,
    setLimit,
    loading,
    error,
    refresh,
  } = usePaginatedList<TaleHead>(getAllTales, initialPage, initialLimit);
  const { load } = useLoadTale();

  const loadIntoGame = useCallback(
    async (id: string) => {
      await load(id);
    },
    [load],
  );

  const deleteTale = useCallback(
    async (id: string) => {
      await deleteTaleById(id);
      await refresh();
    },
    [refresh],
  );

  const saveAsScenario = useCallback(
    async (id: string) => {
      const scenarioId = await saveAsScenarioService(id);
      await refresh();
      return scenarioId;
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
    loadIntoGame,
    deleteTale,
    saveAsScenario,
  } as const;
}
