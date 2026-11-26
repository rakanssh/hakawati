import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStickToBottom } from "./useStickToBottom";

let root: Root;
let mounted: boolean;
let stick: ReturnType<typeof useStickToBottom>;
let resize: (() => void) | null;
const disconnect = vi.fn();
const view = new (class {
  scrollTop = 0;
  scrollHeight = 0;
  clientHeight = 0;
  listeners = new Set<() => void>();
  addEventListener(_: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_: string, listener: () => void) {
    this.listeners.delete(listener);
  }
})();

function Harness() {
  stick = useStickToBottom();
  return null;
}

// The browser moves the view first (and reports it), then tells observers it resized.
function resizeTo(clientHeight: number) {
  view.clientHeight = clientHeight;
  view.scrollTop = Math.min(view.scrollTop, view.scrollHeight - clientHeight);
  view.listeners.forEach((listener) => listener());
  resize?.();
}

function scrollTo(scrollTop: number) {
  view.scrollTop = scrollTop;
  view.listeners.forEach((listener) => listener());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  resize = null;
  disconnect.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  Object.assign(view, {
    scrollTop: 1200,
    scrollHeight: 2000,
    clientHeight: 800,
  });
  view.listeners.clear();
  root = createRoot(document.createElement("div"));
  mounted = true;
  act(() => root.render(<Harness />));
  stick.viewportRef.current = view as unknown as HTMLDivElement;
  act(() => root.render(<Harness />));
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useStickToBottom", () => {
  it("keeps the end of the story in view when the keyboard opens", () => {
    resizeTo(500);
    expect(view.scrollTop).toBe(1500);
  });

  it("returns to the same place when the keyboard closes", () => {
    resizeTo(500);
    resizeTo(800);
    expect(view.scrollTop).toBe(1200);
  });

  it("keeps the text at the bottom edge after scrolling with the keyboard open", () => {
    resizeTo(500);
    scrollTo(1000);
    resizeTo(800);
    expect(view.scrollTop).toBe(700);
  });

  it("stops watching the view when it goes away", () => {
    act(() => root.unmount());
    mounted = false;
    expect(disconnect).toHaveBeenCalled();
    expect(view.listeners.size).toBe(0);
  });
});
