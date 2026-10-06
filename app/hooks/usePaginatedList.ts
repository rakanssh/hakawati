import { useCallback, useEffect, useRef, useState } from "react";
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
  const generation = useRef(0);
  const currentPage = useRef({ page, limit, fetchPage });
  currentPage.current = { page, limit, fetchPage };

  const refresh = useCallback(async () => {
    const { page, limit, fetchPage } = currentPage.current;
    const request = ++generation.current;
    const isCurrent = () =>
      generation.current === request &&
      currentPage.current.page === page &&
      currentPage.current.limit === limit &&
      currentPage.current.fetchPage === fetchPage;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchPage(page, limit);
      if (!isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(resp.total / limit));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(resp.data);
      setTotal(resp.total);
    } catch (e) {
      if (isCurrent()) setError(e);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [page, limit, fetchPage, refresh]);

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
