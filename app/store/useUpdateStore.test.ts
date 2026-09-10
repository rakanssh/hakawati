import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useUpdateStore } from "./useUpdateStore";
import { InlineEditableContent } from "@/components/sidebar/inline-editable-content";
import { enqueueLocalOperation } from "@/lib/local-write-queue";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (text, part, index) => `${text}${part}${values[index] ?? ""}`,
      "",
    ),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderSave(save: (data: number) => Promise<void>) {
  const root = createRoot(document.createElement("div"));
  function Harness({ data }: { data: number }) {
    useAutoSave({ data, save });
    return null;
  }
  const render = (data: number) =>
    act(() => root.render(createElement(Harness, { data })));
  render(0);
  return { render, cleanup: () => act(() => root.unmount()) };
}

describe("update installation", () => {
  const initial = useUpdateStore.getState();
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    vi.clearAllMocks();
    useUpdateStore.setState(initial, true);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  function availableUpdate(download = vi.fn().mockResolvedValue(undefined)) {
    const update = {
      download,
      install: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    useUpdateStore.setState({
      phase: "available",
      updateResource: update as unknown as Update,
      updateInfo: { version: "0.16.0", currentVersion: "0.15.2" },
    });
    return update;
  }

  it("saves edits made during download before native installation and ignores repeated install clicks", async () => {
    const download = deferred();
    const saved: number[] = [];
    const harness = renderSave(async (data) => {
      saved.push(data);
    });
    const update = availableUpdate(vi.fn(() => download.promise));
    try {
      harness.render(1);
      let installing!: Promise<void>;
      await act(async () => {
        installing = useUpdateStore.getState().installUpdate();
      });
      expect(saved).toEqual([1]);
      expect(update.download).toHaveBeenCalledOnce();
      harness.render(2);
      await useUpdateStore.getState().installUpdate();
      update.install.mockImplementation(async () => {
        expect(saved).toEqual([1, 2]);
      });
      await act(async () => {
        download.resolve();
        await installing;
      });
      expect(update.install).toHaveBeenCalledOnce();
      expect(relaunch).toHaveBeenCalledOnce();
    } finally {
      harness.cleanup();
    }
  });

  it("keeps the app running when the final save fails", async () => {
    const download = deferred();
    const save = vi.fn().mockResolvedValue(undefined);
    const harness = renderSave(save);
    const update = availableUpdate(vi.fn(() => download.promise));
    try {
      let installing!: Promise<void>;
      await act(async () => {
        installing = useUpdateStore.getState().installUpdate();
      });
      save.mockRejectedValueOnce(new Error("Disk full"));
      harness.render(1);
      await act(async () => {
        download.resolve();
        await installing;
      });
      expect(update.install).not.toHaveBeenCalled();
      expect(relaunch).not.toHaveBeenCalled();
      expect(useUpdateStore.getState()).toMatchObject({
        phase: "error",
        errorMessage: "Disk full",
        pendingChangelogVersion: null,
      });
    } finally {
      harness.cleanup();
    }
  });

  it("commits a focused draft and waits for its queued log write before installation", async () => {
    const download = deferred();
    const writing = deferred();
    const saved = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn((next: string) =>
      enqueueLocalOperation(async () => {
        await writing.promise;
        return next;
      }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Draft() {
      const [data, setData] = useState("Original");
      useAutoSave({ data, save: saved });
      return createElement(InlineEditableContent, {
        initialValue: data,
        onCommit: (next) => {
          setData(next);
          void commit(next);
        },
        onCancel: () => undefined,
      });
    }
    act(() => root.render(createElement(Draft)));
    const update = availableUpdate(vi.fn(() => download.promise));
    try {
      let installing!: Promise<void>;
      await act(async () => {
        installing = useUpdateStore.getState().installUpdate();
      });
      const editor = container.querySelector<HTMLElement>("[contenteditable]")!;
      editor.tabIndex = 0;
      editor.focus();
      editor.textContent = "Last edit";
      expect(document.activeElement).toBe(editor);
      await act(async () => {
        download.resolve();
      });
      expect(commit).toHaveBeenCalledWith("Last edit");
      expect(saved).toHaveBeenCalledWith("Last edit");
      expect(update.install).not.toHaveBeenCalled();
      await act(async () => {
        writing.resolve();
        await installing;
      });
      expect(update.install).toHaveBeenCalledOnce();
    } finally {
      writing.resolve();
      act(() => root.unmount());
      container.remove();
    }
  });
});
