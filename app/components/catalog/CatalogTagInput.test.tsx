import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import { CatalogTagInput } from "./CatalogTagInput";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));

const suggestions = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useCatalogScenarios", () => ({
  useCatalogTagSuggestions: suggestions,
}));

describe("CatalogTagInput", () => {
  let root: Root;
  let container: HTMLDivElement;
  let input: HTMLInputElement;
  const onChange = vi.fn();

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    suggestions.mockReturnValue({
      items: [
        { tag: "sci-fi", count: 4 },
        { tag: "science", count: 2 },
      ],
      loading: false,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    function Harness() {
      const [tags, setTags] = useState<string[]>([]);
      return createElement(CatalogTagInput, {
        value: tags,
        onChange: (next) => {
          onChange(next);
          setTags(next);
        },
        client: { enabled: true } as CatalogClientState,
        search: "space voyage",
        "aria-label": "Filter by tags",
      });
    }
    await act(async () => root.render(createElement(Harness)));
    input = container.querySelector("input")!;
    await act(async () => input.focus());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function fill(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function press(key: string) {
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    });
  }

  it("passes scenario search separately from the typed tag prefix", async () => {
    await fill("sci");
    expect(input.getAttribute("aria-label")).toBe("Filter by tags");
    expect(suggestions.mock.lastCall?.[1]).toMatchObject({
      search: "space voyage",
      q: "sci",
    });
  });

  it("only enables suggestions while the tag field has focus", async () => {
    expect(suggestions.mock.calls[0][0].enabled).toBe(false);
    expect(suggestions.mock.lastCall?.[0].enabled).toBe(true);
    await act(async () => input.blur());
    expect(suggestions.mock.lastCall?.[0].enabled).toBe(false);
    await act(async () => input.focus());
    expect(suggestions.mock.lastCall?.[0].enabled).toBe(true);
  });

  it("selects suggestions with arrows and Enter without adding the prefix", async () => {
    await fill("sci");
    await press("ArrowDown");
    await press("ArrowUp");
    const activeId = input.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(activeId)?.textContent).toContain("science");
    await press("Enter");
    await act(async () => input.blur());
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["science"]);
    expect(input.value).toBe("");
  });

  it("keeps focus during pointer selection so blur cannot commit the prefix", async () => {
    await fill("sci");
    const option =
      document.querySelector<HTMLButtonElement>('[role="option"]')!;
    const pointerDown = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => option.dispatchEvent(pointerDown));
    expect(pointerDown.defaultPrevented).toBe(true);
    await act(async () => option.click());
    await act(async () => input.blur());
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["sci-fi"]);
  });

  it("dismisses suggestions with Escape and still permits a custom tag", async () => {
    await fill("خيال علمي");
    await press("ArrowDown");
    await press("Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    await press("Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["خيال-علمي"]);
  });
});
