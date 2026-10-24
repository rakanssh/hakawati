import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { LLMModel } from "@/types";
import { ApiPreset } from "@/types/api.type";
import { ThinkingLevel } from "./thinking-level";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray) => parts.join(""),
  }),
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
    useSettingsStore.setState(useSettingsStore.getInitialState());
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.GENERIC,
      baseUrl: "https://models.example/v1",
    });
    settings.setRoleConnection("narrator", id);
    settings.setRoleConnection("utility", id);
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

  function groups() {
    return [...container.querySelectorAll<HTMLElement>('[role="radiogroup"]')];
  }

  function options(group: HTMLElement) {
    return [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  }

  function checked(group: HTMLElement) {
    return options(group).find(
      (option) => option.getAttribute("aria-checked") === "true",
    )?.textContent;
  }

  async function choose(group: HTMLElement, label: string) {
    const option = options(group).find((item) => item.textContent === label);
    expect(option).toBeDefined();
    await act(async () => option!.click());
  }

  it("offers only published efforts and Default, independently for both roles", async () => {
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

    const [narrator, utility] = groups();
    expect(options(narrator).map((option) => option.textContent)).toEqual([
      "Default",
      "Low",
      "High",
    ]);
    expect(checked(narrator)).toBe("Default");
    expect(checked(utility)).toBe("Low");

    await choose(narrator, "High");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBe("high");
    expect(useSettingsStore.getState().modelRoles.utility.reasoningEffort).toBe(
      "low",
    );

    await choose(narrator, "Default");
    expect(
      useSettingsStore.getState().modelRoles.narrator.reasoningEffort,
    ).toBeUndefined();
    expect(useSettingsStore.getState().modelRoles.utility.reasoningEffort).toBe(
      "low",
    );
  });

  it("hides the control when a generic provider's model support is unknown", async () => {
    useSettingsStore.getState().setRoleModel("narrator", {
      id: "gpt-5",
      name: "Unverified compatible model",
    });
    await render();
    expect(groups()).toHaveLength(0);
  });

  it("hides the control for an unselected or explicitly unsupported model", async () => {
    await render();
    expect(groups()).toHaveLength(0);
    await act(async () =>
      useSettingsStore.getState().setRoleModel("narrator", {
        ...thinkingModel,
        reasoning: { supportedEfforts: [] },
      }),
    );
    expect(groups()).toHaveLength(0);
    await act(async () =>
      useSettingsStore.getState().setRoleModel("narrator", thinkingModel),
    );
    expect(groups()).toHaveLength(1);
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
    settings.setRoleConnection(
      "narrator",
      settings.addConnection({ preset: ApiPreset.CHATGPT }),
    );
    settings.setRoleModel("narrator", thinkingModel);
    settings.setRoleReasoningEffort("narrator", "high");
    await render();
    expect(checked(groups()[0])).toBe("High");
    expect(container.textContent).not.toContain("output limit");
  });
});
