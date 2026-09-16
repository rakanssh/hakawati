import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryCard } from "@/types/context.type";
import { StorybookEditor } from "./StorybookEditor";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));
vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: () => ({}),
  isModelRoleConfigured: () => false,
}));
vi.mock("@/services/llm/storyCardGenerator", () => ({
  generateStoryCard: vi.fn(),
}));

describe("StorybookEditor triggers", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onAdd = vi.fn();
  const onUpdate = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(scenarioMode?: boolean) {
    function Harness() {
      const [entries, setEntries] = useState<StoryCard[]>([]);
      return (
        <StorybookEditor
          scenarioMode={scenarioMode}
          entries={entries}
          onAdd={(input) => {
            onAdd(input);
            setEntries([{ ...input, id: "card", createdAt: 1, updatedAt: 1 }]);
          }}
          onUpdate={(id, update) => {
            onUpdate(id, update);
            setEntries((previous) =>
              previous.map((entry) =>
                entry.id === id ? { ...entry, ...update } : entry,
              ),
            );
          }}
          onRemove={vi.fn()}
        />
      );
    }
    await act(async () => root.render(<Harness />));
  }

  async function click(text: string) {
    const button = [...document.querySelectorAll("button")].find(
      (element) =>
        element.getAttribute("aria-label") === text ||
        element.textContent?.trim() === text,
    );
    if (!button) throw new Error(`Missing button: ${text}`);
    await act(async () => button.click());
  }

  async function fill(id: string, value: string) {
    const input = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    await act(async () => {
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it.each([true, false])(
    "uses scenario-aware trigger splitting only when scenarioMode is %s",
    async (scenarioMode) => {
      await render(scenarioMode ? true : undefined);
      await click("Add entry");
      await fill("title", "The crossing");
      await fill("content", "A crossroads beside the river.");
      const raw = "harbor, ${Your route? | options: forest, river}, dusk";
      const expected = scenarioMode
        ? ["harbor", "${Your route? | options: forest, river}", "dusk"]
        : ["harbor", "${Your route? | options: forest", "river}", "dusk"];
      await fill("triggers", raw);
      await click("Add Entry");
      expect(onAdd).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ triggers: expected }),
      );
      await click("Edit");
      expect(
        (document.getElementById("triggers") as HTMLInputElement).value,
      ).toBe(raw);
      await fill("content", "A revised crossroads.");
      await click("Save Changes");
      expect(onUpdate).toHaveBeenCalledExactlyOnceWith(
        "card",
        expect.objectContaining({
          content: "A revised crossroads.",
          triggers: expected,
        }),
      );
    },
  );
});
