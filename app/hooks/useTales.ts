import { useCallback, useEffect, useState } from "react";
import { getAllTales, loadTaleIntoGame } from "@/services/tale.service";
import { TaleHead } from "@/types/tale.type";

export function useTalesList(initialPage = 1, initialLimit = 12) {
  const [items, setItems] = useState<TaleHead[]>([]);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getAllTales(page, limit);
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

  const loadIntoGame = useCallback(async (id: string) => {
    await loadTaleIntoGame(id);
  }, []);

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
  } as const;
}
