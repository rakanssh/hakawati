import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bot } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset } from "@/types";
import { SettingsShell } from "../settings-shell";
import SettingsAiSetup, { AiSetupTitle } from ".";

i18n.load("en", {});
i18n.activate("en");

const llm = vi.hoisted(() => ({
  getRoleModels: vi.fn(),
  getConnectionModels: vi.fn(),
}));
vi.mock("@/services/llm", () => llm);
vi.mock("@/services/chatgpt", () => ({
  getChatGptSession: vi.fn(),
  signInWithChatGpt: vi.fn(),
  signOutOfChatGpt: vi.fn(),
  subscribeChatGptSession: vi.fn(() => () => {}),
}));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
  plural: (count: number, forms: { one: string; other: string }) =>
    (count === 1 ? forms.one : forms.other).replace("#", String(count)),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    i18n: { locale: "en" },
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));

const storyModel = { id: "story-model", name: "Story Model" };

let container: HTMLDivElement;
let root: Root;

function text() {
  return document.body.textContent ?? "";
}

function title() {
  return document.querySelector('[data-slot="dialog-title"]')?.textContent;
}

async function click(label: string, selector = "button") {
  const target = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  ).find((element) => element.textContent?.includes(label));
  expect(target, label).toBeDefined();
  await act(async () => target!.click());
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render() {
  await act(async () =>
    root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(SettingsShell<"ai-setup">, {
          open: true,
          onOpenChange: () => {},
          title: createElement("span", null, "Settings"),
          description: createElement("span", null, "Settings"),
          sections: [
            {
              id: "ai-setup",
              label: createElement("span", null, "AI Setup"),
              description: createElement("span", null, "AI"),
              groupId: "ai",
              group: createElement("span", null, "AI"),
              icon: Bot,
              component: SettingsAiSetup,
              subpageTitle: AiSetupTitle,
            },
          ],
        }),
      ),
    ),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  llm.getRoleModels.mockResolvedValue([storyModel]);
  llm.getConnectionModels.mockResolvedValue([storyModel]);
  useSettingsStore.setState(useSettingsStore.getInitialState());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

describe("AI Setup", () => {
  it("sets up the narrator from a first connection", async () => {
    await render();
    expect(text()).toContain("Set up the Narrator to play");

    await click("Add a connection");
    expect(title()).toBe("Add a connection");
    await click("OpenRouter");
    expect(title()).toBe("OpenRouter");
    const save = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Save",
    )!;
    expect(save.disabled).toBe(true);
    await type(
      document.querySelector<HTMLInputElement>('input[type="password"]')!,
      "sk-or-test-key",
    );
    await act(async () => save.click());

    const { connections, modelRoles } = useSettingsStore.getState();
    expect(connections).toEqual([
      expect.objectContaining({
        preset: ApiPreset.OPENROUTER,
        apiKey: "sk-or-test-key",
      }),
    ]);
    expect(title()).toBe("Narrator");
    expect(modelRoles.narrator.connectionId).toBe(connections[0].id);
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      storyModel,
    );
    expect(text()).toContain("Story Model");

    await click("", 'button[aria-label="Back"]');
    expect(title()).toBe("AI Setup");
    expect(text()).toContain("Ready to play");
    expect(text()).toContain("Same as Narrator");
  });

  it("lets the helper leave the narrator for its own connection", async () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "key",
    });
    settings.setRoleConnection("narrator", id);
    await render();

    await click("Helper");
    const same = document.querySelector<HTMLButtonElement>(
      '[role="radio"][aria-checked="true"]',
    );
    expect(same?.textContent).toContain("Same as Narrator");
    await click("OpenRouter", '[role="radio"]');
    expect(useSettingsStore.getState().roleAssignments.utility).toMatchObject({
      sameAsNarrator: false,
      connectionId: id,
    });
    expect(text()).toContain("Story Model");
  });

  it("removes a connection and unassigns its roles", async () => {
    const settings = useSettingsStore.getState();
    const id = settings.addConnection({
      preset: ApiPreset.OPENROUTER,
      apiKey: "sk-or-v1-abcdefgh4f2a",
    });
    settings.setRoleConnection("narrator", id);
    await render();
    expect(text()).toContain("Key saved · ends 4f2a");

    await click("Key saved");
    expect(title()).toBe("OpenRouter");
    expect(text()).toContain("1 model available");
    await click("Remove connection");
    await click("Remove", '[role="alertdialog"] button');

    expect(title()).toBe("AI Setup");
    expect(useSettingsStore.getState().connections).toEqual([]);
    expect(
      useSettingsStore.getState().modelRoles.narrator.connectionId,
    ).toBeNull();
    expect(text()).toContain("Set up the Narrator to play");
  });
});
