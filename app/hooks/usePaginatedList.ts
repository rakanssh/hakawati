import { useCallback, useEffect, useState } from "react";
import { PaginatedResponse } from "@/types/db.type";

export function usePaginatedList<T>(
  fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  initialPage = 1,
  initialLimit = 12,
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchPage(page, limit);
      setItems(resp.data);
      setTotal(resp.total);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, fetchPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
  } as const;
}
