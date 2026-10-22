import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useHideOnScroll } from "./useHideOnScroll";

let root: Root;
let view: { scrollTop: number; scrollHeight: number; clientHeight: number };
let scrollRef: { current: HTMLElement | null };
let bar: ReturnType<typeof useHideOnScroll>;

function Harness() {
  bar = useHideOnScroll(scrollRef);
  return null;
}

function scroll(change: Partial<typeof view>) {
  act(() => {
    Object.assign(view, change);
    bar.onScroll();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  view = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 };
  scrollRef = { current: view as unknown as HTMLElement };
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useHideOnScroll", () => {
  it("stays visible when the story first opens at its end", () => {
    scroll({ scrollTop: 1500 });
    expect(bar.hidden).toBe(false);
  });

  it("hides while the reader scrolls on and shows when they scroll back", () => {
    scroll({ scrollTop: 1000 });
    scroll({ scrollTop: 1100 });
    expect(bar.hidden).toBe(true);
    scroll({ scrollTop: 1080 });
    expect(bar.hidden).toBe(false);
  });

  it("waits for a deliberate scroll", () => {
    scroll({ scrollTop: 1000 });
    scroll({ scrollTop: 1008 });
    expect(bar.hidden).toBe(false);
    scroll({ scrollTop: 1016 });
    expect(bar.hidden).toBe(true);
    scroll({ scrollTop: 1010 });
    expect(bar.hidden).toBe(true);
  });

  it("hides while following new text at the end", () => {
    scroll({ scrollTop: 1500 });
    scroll({ scrollHeight: 2100, scrollTop: 1600 });
    expect(bar.hidden).toBe(true);
  });

  it("stays visible when older text loads in above", () => {
    scroll({ scrollTop: 100 });
    scroll({ scrollHeight: 5000, scrollTop: 3100 });
    expect(bar.hidden).toBe(false);
  });

  it("stays hidden when the keyboard closes at the end", () => {
    scroll({ scrollTop: 1400 });
    scroll({ scrollTop: 1500 });
    expect(bar.hidden).toBe(true);
    scroll({ clientHeight: 800, scrollTop: 1200 });
    expect(bar.hidden).toBe(true);
  });
});
