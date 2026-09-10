import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "./useAutoSave";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderAutoSave(save: (data: number) => Promise<void>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let current!: ReturnType<typeof useAutoSave>;
  function Harness({
    data,
    disabled = false,
    scopeKey = "tale-1",
  }: {
    data: number;
    disabled?: boolean;
    scopeKey?: string;
  }) {
    current = useAutoSave({ data, save, debounceMs: 100, disabled, scopeKey });
    return null;
  }
  const render = (data: number, disabled = false, scopeKey = "tale-1") =>
    act(() => {
      root.render(createElement(Harness, { data, disabled, scopeKey }));
    });
  render(0);
  return {
    render,
    get current() {
      return current;
    },
    cleanup: () => act(() => root.unmount()),
  };
}

describe("useAutoSave", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes the pending snapshot when leaving before the debounce expires", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    harness.render(1);
    expect(save).not.toHaveBeenCalled();
    harness.cleanup();
    expect(save).toHaveBeenCalledWith(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes the previous tale's snapshot when the scope changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    try {
      harness.render(1);
      harness.render(9, false, "tale-2");
      expect(save).toHaveBeenCalledWith(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(save.mock.calls.map(([data]) => data)).toEqual([1, 9]);
    } finally {
      harness.cleanup();
    }
  });

  it("keeps the leave warning when an earlier save finishes while newer edits are pending", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const harness = renderAutoSave(save);
    try {
      harness.render(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      harness.render(2);
      await act(async () => {
        first.resolve();
        await first.promise;
      });
      expect(harness.current.hasUnsavedChanges).toBe(true);
      const leave = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(leave);
      expect(leave.defaultPrevented).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        second.resolve();
        await second.promise;
      });
      expect(harness.current.hasUnsavedChanges).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it("tracks edits while autosave is disabled and saves when reenabled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    try {
      harness.render(1, true);
      expect(harness.current.hasUnsavedChanges).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(save).not.toHaveBeenCalled();
      harness.render(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(harness.current.hasUnsavedChanges).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
