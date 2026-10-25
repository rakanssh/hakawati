import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseNotes } from "./release-notes";
import { WhatsNewModal } from "./whats-new-modal";

const opener = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: opener }));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: { message: string; context: string }) =>
    `${value.message} (${value.context})`,
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray | string) =>
      typeof parts === "string" ? parts : parts.join(""),
  }),
}));

const NOTES = `### Added

- Hakawati for **Android**.

### Changed

- Settings open in a [window](https://hakawati.dev/settings).

### Fixed

- Stop works.
- Sign-in waits longer.

### Security

- Safer links.`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(element: ReactNode) {
  await act(async () => root.render(element));
}

describe("ReleaseNotes", () => {
  it("labels each section and keeps the English notes left to right", async () => {
    await render(createElement(ReleaseNotes, { notes: NOTES }));

    expect(
      [...container.querySelectorAll("h3")].map((h) => h.textContent),
    ).toEqual([
      "New (Release notes section)",
      "Changed (Release notes section)",
      "Fixed (Release notes section)",
      "Security",
    ]);
    const items = [...container.querySelectorAll("li")];
    expect(items.map((li) => li.textContent)).toEqual([
      "Hakawati for Android.",
      "Settings open in a window.",
      "Stop works.",
      "Sign-in waits longer.",
      "Safer links.",
    ]);
    expect(items.every((li) => li.lang === "en" && li.dir === "auto")).toBe(
      true,
    );
    expect(container.querySelector("li strong")?.textContent).toBe("Android");
  });

  it("opens links in the browser instead of the app window", async () => {
    await render(createElement(ReleaseNotes, { notes: NOTES }));

    const link = container.querySelector("a")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => link.dispatchEvent(click));

    expect(click.defaultPrevented).toBe(true);
    expect(opener).toHaveBeenCalledWith("https://hakawati.dev/settings");
  });

  it("shows notes that aren't a changelog section as written", async () => {
    await render(
      createElement(ReleaseNotes, {
        notes: "Hakawati 1.3 is out.\n\n- Themes.",
      }),
    );

    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe(
      "Hakawati 1.3 is out.",
    );
    expect(container.querySelector("li")?.textContent).toBe("Themes.");
  });
});

describe("WhatsNewModal", () => {
  it("names the version and closes from Got it", async () => {
    const onOpenChange = vi.fn();
    await render(
      createElement(WhatsNewModal, {
        open: true,
        onOpenChange,
        version: "1.3.0",
        notes: NOTES,
      }),
    );

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(
      dialog.querySelector('[data-slot="dialog-title"]')?.textContent,
    ).toBe("What’s NewHakawati 1.3.0");
    expect(dialog.querySelectorAll("li")).toHaveLength(5);

    const gotIt = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Got it",
    )!;
    await act(async () => gotIt.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
