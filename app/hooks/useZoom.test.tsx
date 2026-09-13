import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
} from "@/lib/appearance-limits";
import { useZoom } from "./useZoom";

const cleanups: (() => void)[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderZoom(split = true) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let setExternalScale!: (value: number) => void;
  function Harness() {
    const [scale, setScale] = useState(1);
    const [font, setFont] = useState(1);
    setExternalScale = setScale;
    useZoom({
      zoom: scale,
      setZoom: setScale,
      min: UI_SCALE_MIN,
      max: UI_SCALE_MAX,
      step: 0.05,
      ...(split ? { wheel: false } : {}),
    });
    useZoom({
      zoom: font,
      setZoom: setFont,
      min: FONT_SIZE_MIN,
      max: FONT_SIZE_MAX,
      keyboard: false,
      wheel: split,
    });
    return (
      <>
        <output data-scale>{scale}</output>
        <output data-font>{font}</output>
      </>
    );
  }
  act(() => root.render(<Harness />));
  let mounted = true;
  const cleanup = () => {
    if (!mounted) return;
    mounted = false;
    act(() => root.unmount());
  };
  cleanups.push(cleanup);
  return {
    scale: () => Number(container.querySelector("[data-scale]")?.textContent),
    font: () => Number(container.querySelector("[data-font]")?.textContent),
    setScale: (value: number) => act(() => setExternalScale(value)),
    cleanup,
  };
}

function key(key: string, modifiers: KeyboardEventInit = { ctrlKey: true }) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  globalThis.dispatchEvent(event);
  return event;
}

function wheel(deltaY: number, modifiers: WheelEventInit = { ctrlKey: true }) {
  const event = new WheelEvent("wheel", {
    deltaY,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  globalThis.dispatchEvent(event);
  return event;
}

describe("useZoom input routing", () => {
  it("separates keyboard scale, wheel font size, and keyboard reset", () => {
    const zoom = renderZoom();
    act(() => {
      expect(key("=").defaultPrevented).toBe(true);
      expect(key("+", { metaKey: true }).defaultPrevented).toBe(true);
    });
    expect(zoom.scale()).toBeCloseTo(1.1);
    expect(zoom.font()).toBe(1);

    act(() => {
      expect(wheel(-100, { metaKey: true }).defaultPrevented).toBe(true);
    });
    expect(zoom.scale()).toBeCloseTo(1.1);
    expect(zoom.font()).toBeCloseTo(1.1);

    act(() => {
      key("-");
    });
    expect(zoom.scale()).toBeCloseTo(1.05);
    act(() => {
      expect(key("0", { metaKey: true }).defaultPrevented).toBe(true);
    });
    expect(zoom.scale()).toBe(1);
    expect(zoom.font()).toBeCloseTo(1.1);
  });

  it("accumulates rapid events before a render and respects external changes", () => {
    const zoom = renderZoom();
    act(() => {
      for (let index = 0; index < 4; index++) key("+");
      for (let index = 0; index < 3; index++) wheel(-1);
    });
    expect(zoom.scale()).toBeCloseTo(1.2);
    expect(zoom.font()).toBeCloseTo(1.3);

    zoom.setScale(0.9);
    act(() => {
      key("+");
    });
    expect(zoom.scale()).toBeCloseTo(0.95);
  });

  it("clamps each setting to its own bounds", () => {
    const zoom = renderZoom();
    act(() => {
      for (let index = 0; index < 40; index++) {
        key("+");
        wheel(-1);
      }
    });
    expect(zoom.scale()).toBe(UI_SCALE_MAX);
    expect(zoom.font()).toBe(FONT_SIZE_MAX);
    act(() => {
      for (let index = 0; index < 40; index++) {
        key("-");
        wheel(1);
      }
    });
    expect(zoom.scale()).toBe(UI_SCALE_MIN);
    expect(zoom.font()).toBe(FONT_SIZE_MIN);
  });

  it("ignores unmodified inputs and unrelated shortcuts", () => {
    const zoom = renderZoom();
    act(() => {
      for (const value of ["+", "-", "=", "0"]) {
        expect(key(value, {}).defaultPrevented).toBe(false);
      }
      expect(wheel(-100, {}).defaultPrevented).toBe(false);
      expect(key("x").defaultPrevented).toBe(false);
    });
    expect(zoom.scale()).toBe(1);
    expect(zoom.font()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps both input methods enabled when options are omitted", () => {
    const zoom = renderZoom(false);
    act(() => {
      key("+");
      wheel(-1);
    });
    expect(zoom.scale()).toBeCloseTo(1.1);
    expect(zoom.font()).toBe(1);
  });

  it("registers only requested listeners and removes them and timers on unmount", () => {
    const add = vi.spyOn(globalThis, "addEventListener");
    const remove = vi.spyOn(globalThis, "removeEventListener");
    const zoom = renderZoom();
    const shortcuts = add.mock.calls.filter(
      ([type]) => type === "keydown" || type === "wheel",
    );
    expect(shortcuts.map(([type]) => type).sort()).toEqual([
      "keydown",
      "wheel",
    ]);
    act(() => {
      key("+");
      wheel(-1);
    });
    expect(vi.getTimerCount()).toBe(2);
    zoom.cleanup();
    for (const [type, listener] of shortcuts) {
      expect(remove).toHaveBeenCalledWith(type, listener);
    }
    expect(vi.getTimerCount()).toBe(0);
    expect(key("+").defaultPrevented).toBe(false);
    expect(wheel(-1).defaultPrevented).toBe(false);
  });
});
