import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPendingAutoSaves, useAutoSave } from "./useAutoSave";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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

  it("keeps failed edits available for another close or update attempt", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disk full"))
      .mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    try {
      harness.render(1);
      await act(async () => {
        await expect(flushPendingAutoSaves()).rejects.toThrow("Disk full");
      });
      expect(harness.current.hasUnsavedChanges).toBe(true);
      await act(flushPendingAutoSaves);
      expect(save.mock.calls.map(([data]) => data)).toEqual([1, 1]);
      expect(harness.current.hasUnsavedChanges).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it("waits for an in-flight save and then flushes newer edits before closing", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    try {
      harness.render(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const closed = vi.fn();
      const closing = flushPendingAutoSaves().then(closed);
      harness.render(2);
      expect(closed).not.toHaveBeenCalled();
      await act(async () => {
        first.resolve();
        await closing;
      });
      expect(save.mock.calls.map(([data]) => data)).toEqual([1, 2]);
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      harness.cleanup();
    }
  });

  it("refuses to close during generation and flushes after generation stops", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const harness = renderAutoSave(save);
    try {
      harness.render(1, true);
      await expect(flushPendingAutoSaves()).rejects.toThrow("Stop generation");
      expect(save).not.toHaveBeenCalled();
      harness.render(1, false);
      await act(flushPendingAutoSaves);
      expect(save).toHaveBeenCalledWith(1);
    } finally {
      harness.cleanup();
    }
  });

  it("keeps a failed departing page's save available for retry before closing", async () => {
    const pending = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const harness = renderAutoSave(save);
    harness.render(1);
    harness.cleanup();
    try {
      const closing = expect(flushPendingAutoSaves()).rejects.toThrow(
        "Disk full",
      );
      pending.reject(new Error("Disk full"));
      await closing;
      await flushPendingAutoSaves();
      expect(save.mock.calls.map(([data]) => data)).toEqual([1, 1]);
    } finally {
      errorLog.mockRestore();
    }
  });
});
