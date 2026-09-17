import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { GameMode, type Scenario } from "@/types/context.type";
import { InventoryEditor } from "./InventoryEditor";
import { StatsEditor } from "./StatsEditor";

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
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

describe.each(["stat", "inventory_item"] as const)(
  "scenario %s editor",
  (kind) => {
    let root: Root;
    let container: HTMLDivElement;
    let saved: Scenario;

    beforeEach(() => {
      (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      saved = {
        id: "scenario",
        name: "Journey",
        description: "",
        initialGameMode: GameMode.GM,
        content: ["first", "second"].map((id) => ({
          type: kind,
          version: 1,
          id,
          name: "Spirit",
          description: `Original ${id} description`,
          ...(kind === "stat"
            ? { value: 5, range: [0, 10] as [number, number] }
            : {}),
        })) as Scenario["content"],
      };
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    function Harness({ initial }: { initial: Scenario }) {
      const [scenario, setScenario] = useState(initial);
      const form = useScenarioForm(scenario, setScenario);
      saved = scenario;
      return kind === "stat" ? (
        <StatsEditor
          stats={form.fields.initialStats}
          onAdd={form.addStat}
          onUpdate={form.updateStat}
          onRemove={form.removeStat}
        />
      ) : (
        <InventoryEditor
          items={form.fields.initialInventory}
          onAdd={form.addInventoryItem}
          onUpdate={form.updateInventoryItem}
          onRemove={form.removeInventoryItem}
        />
      );
    }

    function render(key = "initial") {
      act(() => root.render(<Harness key={key} initial={saved} />));
    }

    function fill(input: HTMLInputElement, value: string) {
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    function type(input: HTMLInputElement, text: string) {
      act(() => input.focus());
      fill(input, "");
      for (let length = 1; length <= text.length; length++) {
        fill(input, text.slice(0, length));
        expect(input.value).toBe(text.slice(0, length));
        expect(document.activeElement).toBe(input);
      }
    }

    it("keeps the edited row focused while typing a question and targets duplicate names by ID", () => {
      render();
      const name = container.querySelector("input")!;
      const question = "${Which spirit follows you?}";
      type(name, question);
      expect(saved.content.find((item) => item.id === "first")).toMatchObject({
        name: question,
      });
      expect(saved.content.find((item) => item.id === "second")).toMatchObject({
        name: "Spirit",
      });
      const remove = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Remove",
      )!;
      act(() => remove.click());
      expect(saved.content.map((item) => item.id)).toEqual(["second"]);
      expect(container.querySelector("input")?.value).toBe("Spirit");
    });

    it("roundtrips question descriptions through the form and permits clearing them", () => {
      render();
      const description = () =>
        container.querySelector<HTMLInputElement>(
          'input[placeholder="Description (optional)"]',
        )!;
      expect(description().value).toBe("Original first description");
      const question =
        "From ${Where did you grow up? | options: a forest, a city}";
      type(description(), question);
      expect(saved.content.find((item) => item.id === "first")).toMatchObject({
        description: question,
      });
      render("reopened");
      expect(description().value).toBe(question);
      fill(description(), "");
      render("reopened-after-clearing");
      expect(description().value).toBe("");
      expect(saved.content.find((item) => item.id === "second")).toMatchObject({
        description: "Original second description",
      });
    });
  },
);
