import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ScenarioAnswers,
  ScenarioQuestion,
} from "@/lib/scenario-questions";
import { ScenarioStartWizard } from "./ScenarioStartWizard";

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

const questions: ScenarioQuestion[] = [
  { id: "name", question: "Your name?", mode: "text", options: [] },
  {
    id: "home",
    question: "Your home?",
    mode: "options",
    options: ["Forest", "Mountain"],
  },
  {
    id: "path",
    question: "Your path?",
    mode: "choices",
    options: ["A very long road through the mountains", "Sea"],
  },
];

describe("ScenarioStartWizard", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onComplete = vi.fn<(answers: ScenarioAnswers) => Promise<void>>();
  const onCancel = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    onComplete.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(items = questions) {
    act(() =>
      root.render(
        <ScenarioStartWizard
          title="The journey"
          questions={items}
          onComplete={onComplete}
          onCancel={onCancel}
        />,
      ),
    );
  }

  function button(text: string) {
    const element = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    );
    if (!element) throw new Error(`Missing button: ${text}`);
    return element;
  }

  async function click(text: string) {
    await act(async () => button(text).click());
  }

  function fill(value: string) {
    const input = container.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("requires every answer, retains answers on Back, allows custom options, and restricts choices", async () => {
    render();
    expect(button("Next").disabled).toBe(true);
    fill("   ");
    expect(button("Next").disabled).toBe(true);
    fill("Mira");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(container.querySelector("h2")?.textContent).toBe("Your home?");
    expect(button("Next").disabled).toBe(true);
    await click("Forest");
    expect(container.querySelector("input")?.value).toBe("Forest");
    fill("A floating city");
    await click("Back");
    expect(container.querySelector("input")?.value).toBe("Mira");
    await click("Next");
    expect(container.querySelector("input")?.value).toBe("A floating city");
    await click("Next");
    expect(container.querySelector("input")).toBeNull();
    expect(button("Start Tale").disabled).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("h2"));
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuenow")).toBe("3");
    expect(progress?.getAttribute("aria-valuemax")).toBe("3");
    expect(progress?.getAttribute("aria-label")).toBe("Question progress");
    await click("Sea");
    expect(button("Sea").getAttribute("aria-pressed")).toBe("true");
    await click("Start Tale");
    expect(onComplete).toHaveBeenCalledWith({
      name: "Mira",
      home: "A floating city",
      path: "Sea",
    });
  });

  it("guards duplicate submission and retains answers after a failure for retry", async () => {
    let reject!: (error: Error) => void;
    onComplete.mockReturnValueOnce(
      new Promise<void>((_, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    render([questions[0]]);
    fill("Mira");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button("Cancel").disabled).toBe(true);
    expect(container.querySelector("input")?.disabled).toBe(true);
    await act(async () => reject(new Error("Connection lost")));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Connection lost",
    );
    expect(container.querySelector("input")?.value).toBe("Mira");
    await click("Start Tale");
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("cancels without starting and permits explicit confirmation when the refreshed scenario has no questions", async () => {
    render([]);
    await click("Cancel");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    await click("Start Tale");
    expect(onComplete).toHaveBeenCalledWith({});
  });
});
