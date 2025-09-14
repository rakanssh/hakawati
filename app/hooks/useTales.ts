import { useCallback } from "react";
import { getAllTales, deleteTaleById } from "@/services/tale.service";
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
  } as const;
}
