import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogTransport } from "@/services/catalog.service";
import {
  selectCatalogReadTransport,
  useCatalogScenarioList,
  useCatalogTagSuggestions,
  usePublishedCatalogScenarios,
  type CatalogClientState,
} from "./useCatalogScenarios";

function transport() {
  return {
    get: vi.fn<CatalogTransport["get"]>().mockResolvedValue(page()),
    post: vi.fn(),
    patch: vi.fn(),
  };
}

function client(): CatalogClientState {
  return {
    baseUrl: "https://cloud.example",
    signedIn: true,
    enabled: true,
    publishingEnabled: true,
    thumbnailUploads: false,
    loading: false,
    error: null,
    capabilities: null,
    publicTransport: transport(),
    authTransport: transport(),
    refreshCapabilities: vi.fn(),
  };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function page(ids: string[] = [], nextCursor: string | null = null) {
  return { items: ids.map((id) => ({ id })), nextCursor };
}

const cleanups: (() => void)[] = [];

function renderHook<T>(useHook: () => T) {
  let current!: T;
  const root = createRoot(document.createElement("div"));
  function Harness() {
    current = useHook();
    return null;
  }
  const rerender = () => act(() => root.render(createElement(Harness)));
  rerender();
  cleanups.push(() => act(() => root.unmount()));
  return {
    get current() {
      return current;
    },
    rerender,
  };
}

const debounce = () => act(() => vi.advanceTimersByTimeAsync(200));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe("selectCatalogReadTransport", () => {
  it("uses authentication when available and otherwise stays public", () => {
    const publicTransport = transport();
    const authTransport = transport();

    expect(selectCatalogReadTransport({ publicTransport, authTransport })).toBe(
      authTransport,
    );
    expect(
      selectCatalogReadTransport({ publicTransport, authTransport: null }),
    ).toBe(publicTransport);
  });
});

describe.each([
  { name: "public", useList: useCatalogScenarioList, sort: "newest" },
  { name: "owned", useList: usePublishedCatalogScenarios, sort: "updated" },
])("$name catalog lists", ({ useList, sort }) => {
  it("keeps inactive lists idle and fetches current filters when activated", async () => {
    let catalog = { ...client(), enabled: false };
    const read = transport();
    catalog.authTransport = read;
    let q = "castle";
    const hook = renderHook(() => useList(catalog, {}, { q }));
    await debounce();
    q = "forest";
    hook.rerender();
    await debounce();
    expect(read.get).not.toHaveBeenCalled();

    catalog = { ...catalog, enabled: true };
    hook.rerender();
    await debounce();
    expect(read.get).toHaveBeenCalledTimes(1);
    expect(read.get.mock.calls[0][0]).toContain("q=forest");

    catalog = { ...catalog, enabled: false };
    hook.rerender();
    await act(async () => hook.current.refresh());
    await debounce();
    expect(read.get).toHaveBeenCalledTimes(1);
  });

  it("initializes filters and ignores stale refresh results, errors and finalizers", async () => {
    const catalog = client();
    const read = transport();
    catalog.authTransport = read;
    const old = deferred();
    const superseded = deferred();
    const current = deferred();
    read.get
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(superseded.promise)
      .mockReturnValueOnce(current.promise);
    const hook = renderHook(() =>
      useList(catalog, { q: "old", tag: ["Sci Fi"] }),
    );
    expect(hook.current.filters).toMatchObject({
      q: "old",
      tag: ["Sci Fi"],
      sort,
    });
    expect(read.get).not.toHaveBeenCalled();
    await debounce();
    expect(read.get.mock.calls[0][0]).toContain(
      `q=old&sort=${sort}&tag=sci-fi`,
    );

    act(() => hook.current.setFilters((filters) => ({ ...filters, q: "new" })));
    await act(async () => old.resolve(page(["stale"])));
    expect(hook.current.items).toEqual([]);
    expect(hook.current.loading).toBe(true);
    await debounce();
    act(() => {
      void hook.current.refresh();
    });
    await act(async () => superseded.reject(new Error("stale failure")));
    expect(hook.current.error).toBeNull();
    expect(hook.current.loading).toBe(true);
    await act(async () => current.resolve(page(["new"], "next")));
    expect(hook.current.items.map((item) => item.id)).toEqual(["new"]);
    expect(hook.current.nextCursor).toBe("next");
    expect(hook.current.loading).toBe(false);
  });

  it("serializes load-more requests, keeps a failed page retryable and invalidates old pagination", async () => {
    const catalog = client();
    const read = transport();
    catalog.authTransport = read;
    const failed = deferred();
    const retry = deferred();
    const stale = deferred();
    read.get
      .mockResolvedValueOnce(page(["one"], "page-2"))
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(retry.promise)
      .mockReturnValueOnce(stale.promise);
    const hook = renderHook(() => useList(catalog));
    await debounce();
    act(() => {
      void hook.current.loadMore();
      void hook.current.loadMore();
    });
    expect(read.get).toHaveBeenCalledTimes(2);
    await act(async () => failed.reject(new Error("offline")));
    expect(hook.current.items.map((item) => item.id)).toEqual(["one"]);
    expect(hook.current.nextCursor).toBe("page-2");
    expect(hook.current.error).toBeInstanceOf(Error);
    act(() => {
      void hook.current.loadMore();
    });
    await act(async () => retry.resolve(page(["one", "two"], "page-3")));
    expect(hook.current.items.map((item) => item.id)).toEqual(["one", "two"]);
    expect(hook.current.error).toBeNull();

    const oldLoadMore = hook.current.loadMore;
    act(() => {
      void oldLoadMore();
    });
    act(() =>
      hook.current.setFilters((filters) => ({ ...filters, tag: ["fantasy"] })),
    );
    expect(hook.current.items).toEqual([]);
    expect(hook.current.nextCursor).toBeNull();
    act(() => {
      void oldLoadMore();
      void hook.current.loadMore();
    });
    expect(read.get).toHaveBeenCalledTimes(4);
    await act(async () => stale.resolve(page(["old-page"])));
    expect(hook.current.items).toEqual([]);
    expect(hook.current.loading).toBe(true);
    await debounce();
    expect(read.get.mock.calls[4][0]).toContain("tag=fantasy");
    expect(read.get.mock.calls[4][0]).not.toContain("cursor=");
  });

  it("uses controlled filters and discards work when authentication or availability changes", async () => {
    let catalog = client();
    const first = transport();
    const second = transport();
    catalog.authTransport = first;
    const stale = deferred();
    const disabled = deferred();
    first.get.mockReturnValueOnce(stale.promise);
    second.get
      .mockResolvedValueOnce(page(["new-account"], "next"))
      .mockReturnValueOnce(disabled.promise);
    let query = "castle";
    const hook = renderHook(() =>
      useList(catalog, {}, { q: query, tag: [], sort: "newest" }),
    );
    await debounce();
    hook.rerender();
    await debounce();
    expect(first.get).toHaveBeenCalledTimes(1);
    catalog = { ...catalog, authTransport: second };
    hook.rerender();
    await debounce();
    await act(async () => stale.resolve(page(["old-account"])));
    expect(hook.current.items.map((item) => item.id)).toEqual(["new-account"]);
    expect(second.get.mock.calls[0][0]).toContain("q=castle");
    act(() => {
      void hook.current.loadMore();
    });
    catalog = { ...catalog, enabled: false };
    query = "forest";
    hook.rerender();
    expect(hook.current.items).toEqual([]);
    expect(hook.current.nextCursor).toBeNull();
    expect(hook.current.loading).toBe(false);
    await act(async () => disabled.reject(new Error("late failure")));
    expect(hook.current.error).toBeNull();
    await debounce();
    expect(second.get).toHaveBeenCalledTimes(2);
  });
});

describe("catalog tag suggestions", () => {
  it("debounces prefix edits, preserves the search context and ignores fresh equivalent tag arrays", async () => {
    const catalog = client();
    const auth = transport();
    catalog.authTransport = auth;
    const old = deferred();
    const current = deferred();
    auth.get
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    let q = "s";
    const hook = renderHook(() =>
      useCatalogTagSuggestions(catalog, {
        q,
        search: "Iron Gate",
        tag: ["fantasy"],
      }),
    );
    await debounce();
    hook.rerender();
    await debounce();
    expect(auth.get).toHaveBeenCalledTimes(1);
    expect(catalog.publicTransport!.get).not.toHaveBeenCalled();
    q = "sc";
    hook.rerender();
    q = "sci";
    hook.rerender();
    await act(async () => old.resolve({ items: [{ tag: "stale", count: 9 }] }));
    expect(hook.current.items).toEqual([]);
    expect(hook.current.loading).toBe(true);
    await debounce();
    expect(auth.get).toHaveBeenCalledTimes(2);
    expect(auth.get.mock.calls[1][0]).toBe(
      "/v1/catalog/tags?q=sci&search=Iron+Gate&tag=fantasy",
    );
    await act(async () =>
      current.resolve({ items: [{ tag: "sci-fi", count: 2 }] }),
    );
    hook.rerender();
    await debounce();
    expect(auth.get).toHaveBeenCalledTimes(2);
    expect(hook.current.items).toEqual([{ tag: "sci-fi", count: 2 }]);
  });

  it("falls back to public suggestions after logout and clears loading when disabled", async () => {
    let catalog = client();
    const auth = transport();
    const publicRead = transport();
    const stale = deferred();
    auth.get.mockReturnValueOnce(stale.promise);
    publicRead.get.mockResolvedValueOnce({
      items: [{ tag: "public", count: 4 }],
    });
    catalog = { ...catalog, authTransport: auth, publicTransport: publicRead };
    const hook = renderHook(() =>
      useCatalogTagSuggestions(catalog, { tag: [] }),
    );
    await debounce();
    catalog = { ...catalog, authTransport: null, signedIn: false };
    hook.rerender();
    await act(async () => stale.reject(new Error("expired")));
    expect(hook.current.loading).toBe(true);
    await debounce();
    expect(hook.current.items).toEqual([{ tag: "public", count: 4 }]);
    catalog = { ...catalog, enabled: false };
    hook.rerender();
    expect(hook.current.items).toEqual([]);
    expect(hook.current.loading).toBe(false);
  });
});
