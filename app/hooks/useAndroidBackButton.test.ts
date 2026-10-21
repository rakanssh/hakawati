import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAndroidBackButton } from "./useAndroidBackButton";

type BackHandler = (payload: { canGoBack: boolean }) => void;

const mocks = vi.hoisted(() => ({
  backHandler: undefined as BackHandler | undefined,
  exit: vi.fn(),
  flushPendingAutoSaves: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (text, part, index) => `${text}${part}${values[index] ?? ""}`,
      "",
    ),
}));

vi.mock("@tauri-apps/api/app", () => ({
  onBackButtonPress: async (handler: BackHandler) => {
    mocks.backHandler = handler;
    return { unregister: async () => undefined };
  },
}));

vi.mock("@tauri-apps/plugin-process", () => ({ exit: mocks.exit }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

vi.mock("./useAutoSave", () => ({
  flushPendingAutoSaves: mocks.flushPendingAutoSaves,
}));

vi.mock("./useIsMobile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useIsMobile")>()),
  useIsMobile: () => ({ platform: "android" }),
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let cleanup: (() => void) | undefined;

async function renderHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  function Harness() {
    useAndroidBackButton();
    return null;
  }
  act(() => root.render(createElement(Harness)));
  await settle();
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
}

function pressBack(canGoBack = false) {
  if (!mocks.backHandler) throw new Error("Back handler was not registered.");
  mocks.backHandler({ canGoBack });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/");
  mocks.backHandler = undefined;
  mocks.exit.mockReset().mockResolvedValue(undefined);
  mocks.flushPendingAutoSaves.mockReset().mockResolvedValue(undefined);
  mocks.navigate.mockReset();
  mocks.toastError.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

describe("useAndroidBackButton", () => {
  it("waits for pending saves before leaving from the home screen", async () => {
    const save = deferred();
    mocks.flushPendingAutoSaves.mockReturnValue(save.promise);
    await renderHook();

    pressBack();
    await settle();
    expect(mocks.flushPendingAutoSaves).toHaveBeenCalledOnce();
    expect(mocks.exit).not.toHaveBeenCalled();

    save.resolve();
    await settle();
    expect(mocks.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("ignores more presses while the save is still running", async () => {
    const save = deferred();
    mocks.flushPendingAutoSaves.mockReturnValue(save.promise);
    await renderHook();

    pressBack();
    pressBack();
    save.resolve();
    await settle();

    expect(mocks.flushPendingAutoSaves).toHaveBeenCalledOnce();
    expect(mocks.exit).toHaveBeenCalledOnce();
  });

  it("stays open when the save fails and retries on the next press", async () => {
    mocks.flushPendingAutoSaves.mockRejectedValueOnce(new Error("disk full"));
    await renderHook();

    pressBack();
    await settle();
    expect(mocks.exit).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledOnce();

    pressBack();
    await settle();
    expect(mocks.flushPendingAutoSaves).toHaveBeenCalledTimes(2);
    expect(mocks.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("goes back a page away from the home screen without leaving", async () => {
    window.history.replaceState(null, "", "/play");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await renderHook();

    pressBack(true);
    await settle();

    expect(back).toHaveBeenCalledOnce();
    expect(mocks.flushPendingAutoSaves).not.toHaveBeenCalled();
    expect(mocks.exit).not.toHaveBeenCalled();
  });
});
