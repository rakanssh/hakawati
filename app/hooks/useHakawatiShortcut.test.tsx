import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: route.pathname } }),
}));

const { useHakawatiShortcut } = await import("./useHakawatiShortcut");
const { useStoryPanelStore } = await import("@/store/useStoryPanelStore");
const { useAssistantStore } = await import("@/store/useAssistantStore");

function Harness() {
  useHakawatiShortcut();
  return <textarea data-hakawati-composer="" aria-label="composer" />;
}

const press = (options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    code: "KeyK",
    key: "k",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
};

describe("useHakawatiShortcut", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    route.pathname = "/";
    useStoryPanelStore.setState({ open: false, tab: "cards" });
    useAssistantStore.setState({ focusComposer: false });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens Hakawati ready to type, on its tab when playing", () => {
    expect(press().defaultPrevented).toBe(true);
    expect(useStoryPanelStore.getState()).toMatchObject({
      open: true,
      tab: "cards",
    });
    expect(useAssistantStore.getState().focusComposer).toBe(true);

    useStoryPanelStore.setState({ open: false });
    route.pathname = "/play";
    act(() => root.render(<Harness />));
    press();
    expect(useStoryPanelStore.getState()).toMatchObject({
      open: true,
      tab: "hakawati",
    });
  });

  it("closes Hakawati from its message box", () => {
    useStoryPanelStore.setState({ open: true });
    container.querySelector("textarea")!.focus();
    press();
    expect(useStoryPanelStore.getState().open).toBe(false);
  });

  it("leaves other keys and open dialogs alone", () => {
    expect(press({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(press({ ctrlKey: false }).defaultPrevented).toBe(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(press().defaultPrevented).toBe(false);
    expect(useStoryPanelStore.getState().open).toBe(false);
    dialog.remove();
  });
});
