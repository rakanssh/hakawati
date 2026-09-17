import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaleStore } from "@/store/useTaleStore";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { LogEntryRole } from "@/types/log.type";

const mocks = vi.hoisted(() => ({
  deleteTaleById: vi.fn(),
  getTaleById: vi.fn(),
  getAllTales: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/services/tale.service", () => mocks);
vi.mock("@/repositories/tale.repository", () => ({ getLogEntries: vi.fn() }));
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));
vi.mock("@/hooks/usePaginatedList", () => ({
  usePaginatedList: () => ({ items: [], refresh: mocks.refresh }),
}));

import { useTalesList } from "./useTales";

function loadedTale(id: string) {
  return {
    ...useTaleStore.getInitialState(),
    id,
    name: `Tale ${id}`,
    log: [{ id: `${id}-entry`, role: LogEntryRole.GM, text: "Saved story." }],
    totalLogCount: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let cleanup: () => void;
function renderLibrary() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let library!: ReturnType<typeof useTalesList>;
  function Harness() {
    library = useTalesList();
    return null;
  }
  act(() => root.render(createElement(Harness)));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return {
    get current() {
      return library;
    },
  };
}

describe("deleting a library tale", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    mocks.deleteTaleById.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue(undefined);
    useTaleStore.setState(loadedTale("A"));
    useLastPlayedStore.getState().setLastPlayedTaleId("A");
  });
  afterEach(() => cleanup());

  it("clears the deleted tale from Play and the persisted Continue shortcut", async () => {
    const library = renderLibrary();
    await act(async () => {
      await library.current.deleteTale("A");
    });
    expect(mocks.deleteTaleById).toHaveBeenCalledWith("A");
    expect(useTaleStore.getState()).toMatchObject({
      id: "",
      name: "",
      log: [],
      totalLogCount: 0,
    });
    expect(useLastPlayedStore.getState().lastPlayedTaleId).toBeNull();
  });

  it("keeps the active tale when deletion fails", async () => {
    mocks.deleteTaleById.mockRejectedValueOnce(new Error("Delete failed"));
    const library = renderLibrary();
    await expect(library.current.deleteTale("A")).rejects.toThrow(
      "Delete failed",
    );
    expect(useTaleStore.getState().id).toBe("A");
    expect(useTaleStore.getState().log).toHaveLength(1);
    expect(useLastPlayedStore.getState().lastPlayedTaleId).toBe("A");
  });

  it("preserves another tale loaded while deletion is pending", async () => {
    const deletion = deferred<void>();
    mocks.deleteTaleById.mockReturnValueOnce(deletion.promise);
    mocks.getTaleById.mockResolvedValueOnce(loadedTale("B"));
    const library = renderLibrary();
    const deleting = library.current.deleteTale("A");
    await act(async () => {
      await library.current.loadIntoGame("B");
    });
    await act(async () => {
      deletion.resolve();
      await deleting;
    });
    expect(useTaleStore.getState().id).toBe("B");
    expect(useTaleStore.getState().log[0].id).toBe("B-entry");
    expect(useLastPlayedStore.getState().lastPlayedTaleId).toBe("B");
  });

  it("prevents a pending load from restoring a deleted tale", async () => {
    const pendingLoad = deferred<ReturnType<typeof loadedTale>>();
    mocks.getTaleById.mockReturnValueOnce(pendingLoad.promise);
    const library = renderLibrary();
    let loading!: Promise<void>;
    act(() => {
      loading = library.current.loadIntoGame("A");
    });
    await act(async () => {
      await library.current.deleteTale("A");
    });
    await act(async () => {
      pendingLoad.resolve(loadedTale("A"));
      await loading;
    });
    expect(useTaleStore.getState()).toMatchObject({
      id: "",
      loadingTaleId: null,
      log: [],
    });
    expect(useLastPlayedStore.getState().lastPlayedTaleId).toBeNull();
  });
});
