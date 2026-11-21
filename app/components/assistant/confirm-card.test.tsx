import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantConfirm } from "@/types/assistant.type";

const { answer } = vi.hoisted(() => ({ answer: vi.fn() }));
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
vi.mock("@/services/assistant/session", () => ({
  answerAssistantConfirm: answer,
}));

const { ConfirmCard } = await import("./confirm-card");

describe("ConfirmCard", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    answer.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (confirm: AssistantConfirm) =>
    act(() => root.render(<ConfirmCard confirm={confirm} />));
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    )!;

  it("names what will be deleted and answers with the player's click", () => {
    render({ action: "delete_tales", names: ["Quiet Sea"] });
    expect(container.textContent).toContain("Delete this tale?");
    expect(container.textContent).toContain("Quiet Sea");
    expect(container.textContent).toContain("This can't be undone.");
    act(() => button("Delete").click());
    expect(answer).toHaveBeenCalledWith(true);
    act(() => button("Cancel").click());
    expect(answer).toHaveBeenLastCalledWith(false);
  });

  it("shows the first five names of a long list", () => {
    render({
      action: "delete_scenarios",
      names: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(container.textContent).toContain("Delete 7 scenarios?");
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.textContent).toContain("and 2 more");
  });

  it("doesn't call removing from the cloud permanent", () => {
    render({ action: "remove_from_cloud", names: ["Quiet Sea"] });
    expect(container.textContent).not.toContain("can't be undone");
    expect(button("Remove from cloud")).toBeDefined();
  });
});
