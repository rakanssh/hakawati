import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

let container: HTMLDivElement;
let root: Root;

function pointer(type: string, pointerType: "touch" | "mouse") {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

function trigger() {
  return container.querySelector<HTMLButtonElement>("button")!;
}

function menuOpen() {
  return document.querySelector('[role="menu"]') !== null;
}

async function render(props: Record<string, unknown> = {}) {
  await act(async () =>
    root.render(
      createElement(
        DropdownMenu,
        props,
        createElement(DropdownMenuTrigger, null, "Create"),
        createElement(
          DropdownMenuContent,
          null,
          createElement(DropdownMenuItem, null, "Scenario"),
        ),
      ),
    ),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DropdownMenuTrigger", () => {
  it("doesn't open when a finger lands on it, so a swipe can scroll", async () => {
    await render();
    await act(async () =>
      trigger().dispatchEvent(pointer("pointerdown", "touch")),
    );
    expect(menuOpen()).toBe(false);
  });

  it("opens on a finger tap", async () => {
    await render();
    await act(async () => {
      trigger().dispatchEvent(pointer("pointerdown", "touch"));
      trigger().click();
    });
    expect(menuOpen()).toBe(true);
  });

  it("still opens on a mouse press", async () => {
    await render();
    await act(async () =>
      trigger().dispatchEvent(pointer("pointerdown", "mouse")),
    );
    expect(menuOpen()).toBe(true);
  });

  it("reports a tap to a controlled menu", async () => {
    const onOpenChange = vi.fn();
    await render({ open: false, onOpenChange });
    await act(async () => {
      trigger().dispatchEvent(pointer("pointerdown", "touch"));
      trigger().click();
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(menuOpen()).toBe(false);
  });
});
