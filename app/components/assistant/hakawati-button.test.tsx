import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({ pathname: "/", phone: true }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: device.pathname } }),
}));
vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => ({ isMobilePlatform: device.phone }),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray) => parts.join(""),
  }),
}));

const { HakawatiFab } = await import("./hakawati-button");
const { useStoryPanelStore } = await import("@/store/useStoryPanelStore");

describe("HakawatiFab", () => {
  let root: Root;
  let container: HTMLDivElement;
  let scroller: HTMLDivElement;
  let scrollTop = 0;

  const fab = () =>
    container.querySelector<HTMLButtonElement>("[data-hakawati-fab]");
  const scrollTo = (top: number) =>
    act(() => {
      scrollTop = top;
      scroller.dispatchEvent(new Event("scroll"));
    });
  const render = () =>
    act(() =>
      root.render(
        <>
          <HakawatiFab scroller={{ current: scroller }} />
          <input aria-label="search" />
          <input type="checkbox" aria-label="toggle" />
        </>,
      ),
    );

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    device.pathname = "/";
    device.phone = true;
    useStoryPanelStore.getState().setOpen(false);
    container = document.createElement("div");
    scroller = document.createElement("div");
    scrollTop = 0;
    Object.defineProperties(scroller, {
      scrollTop: { get: () => scrollTop },
      scrollHeight: { value: 2000 },
      clientHeight: { value: 800 },
    });
    document.body.append(container, scroller);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    scroller.remove();
  });

  it("opens the panel from the bottom of a phone screen", () => {
    render();
    act(() => fab()!.click());
    expect(useStoryPanelStore.getState().open).toBe(true);
    expect(fab()).toBeNull();
  });

  it("stays off desktop and the play screen", () => {
    device.phone = false;
    render();
    expect(fab()).toBeNull();
    device.phone = true;
    device.pathname = "/play";
    render();
    expect(fab()).toBeNull();
  });

  it("hides while a text field has focus", () => {
    render();
    const search = container.querySelector<HTMLInputElement>(
      "[aria-label=search]",
    )!;
    const toggle = container.querySelector<HTMLInputElement>(
      "[aria-label=toggle]",
    )!;
    act(() => search.focus());
    expect(fab()).toBeNull();
    act(() => toggle.focus());
    expect(fab()).not.toBeNull();
    act(() => search.focus());
    act(() => search.blur());
    expect(fab()).not.toBeNull();
  });

  it("hides while scrolling down and returns on the way up or on a new page", () => {
    render();
    scrollTo(300);
    expect(fab()).toBeNull();
    scrollTo(1260);
    scrollTo(1200);
    expect(fab()).toBeNull();
    scrollTo(900);
    expect(fab()).not.toBeNull();
    scrollTo(905);
    expect(fab()).not.toBeNull();
    scrollTo(1000);
    expect(fab()).toBeNull();
    device.pathname = "/tales";
    render();
    expect(fab()).not.toBeNull();
  });
});
