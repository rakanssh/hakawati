import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { LLMModel } from "@/services/llm/schema";
import { ApiPreset } from "@/types/api.type";
import { ThinkingLevel } from "./thinking-level";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

const thinkingModel: LLMModel = {
  id: "provider/reasoner",
  name: "Reasoner",
  reasoning: { supportedEfforts: ["low", "high"], mandatory: true },
};

describe("ThinkingLevel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  async function render(role: "narrator" | "utility" = "narrator") {
    await act(async () => root.render(createElement(ThinkingLevel, { role })));
  }

  async function open(role = "narrator") {
    const trigger = container.querySelector<HTMLButtonElement>(
      `#${role}-thinking-level`,
    )!;
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  async function choose(label: string) {
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((item) => item.textContent === label);
    expect(option).toBeDefined();
    await act(async () => option!.click());
  }

  it("offers only published efforts and Model default, independently for both roles", async () => {
    const settings = useSettingsStore.getState();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleModel("utility", thinkingModel);
    settings.setRoleReasoningEffort("utility", "low");
    await act(async () =>
      root.render(
        createElement(
          Fragment,
          {},
          createElement(ThinkingLevel, { role: "narrator" }),
          createElement(ThinkingLevel, { role: "utility" }),
        ),
      ),
    );

    expect(
      container.querySelector('label[for="narrator-thinking-level"]')
        ?.textContent,
    ).toBe("Thinking level");
    expect(
      container.querySelector("#narrator-thinking-level")?.textContent,
    ).toBe("Model default");
    expect(
      container.querySelector("#utility-thinking-level")?.textContent,
    ).toBe("Low");
    await open();
    expect(
      Array.from(document.querySelectorAll('[role="option"]')).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Model default", "Low", "High"]);
    await choose("High");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBe("high");
    expect(useSettingsStore.getState().modelRoles.utility.reasoningEffort).toBe(
      "low",
    );
    await open();
    await choose("Model default");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    expect(useSettingsStore.getState().modelRoles.utility.reasoningEffort).toBe(
      "low",
    );
  });

  it("shows disabled Model default for unknown generic model support", async () => {
    useSettingsStore.getState().setRoleModel("narrator", {
      id: "gpt-5",
      name: "Unverified compatible model",
    });
    await render();
    const trigger =
      container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toBe("Model default");
  });

  it("disables the selector for an unselected or explicitly unsupported model", async () => {
    await render();
    expect(
      container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled,
    ).toBe(true);
    await act(async () =>
      useSettingsStore.getState().setRoleModel("narrator", {
        ...thinkingModel,
        reasoning: { supportedEfforts: [] },
      }),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled,
    ).toBe(true);
  });

  it("warns about a small API output budget while preserving the user's limit", async () => {
    const settings = useSettingsStore.getState();
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    await render();
    expect(container.textContent).toContain(
      "Thinking and the answer share your output limit.",
    );
    expect(useSettingsStore.getState().maxTokens).toBe(2048);
    await act(async () => settings.setMaxTokens(16384));
    expect(container.textContent).not.toContain(
      "Thinking and the answer share your output limit.",
    );
  });

  it("does not suggest changing output limits for a ChatGPT subscription", async () => {
    const settings = useSettingsStore.getState();
    settings.setRoleActivePreset("narrator", ApiPreset.CHATGPT);
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    await render();
    expect(
      container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled,
    ).toBe(false);
    expect(container.textContent).not.toContain("Max Output");
  });
});
