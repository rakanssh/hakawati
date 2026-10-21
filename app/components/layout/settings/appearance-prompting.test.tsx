import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Palette, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { AI_INSTRUCTIONS_PROMPT } from "@/prompts";
import { SettingsShell } from "./settings-shell";
import SettingsGame, { AppearanceTitle } from "./game";
import SettingsAdvanced, { PromptingTitle } from "./advanced";

i18n.load("en", {});
i18n.activate("en");

const themeState = vi.hoisted(() => ({
  preference: "brass-night",
  setPreference: vi.fn(),
}));
const locale = vi.hoisted(() => ({ loadLocale: vi.fn() }));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => themeState,
}));
// The gallery prepares canvas textures, which jsdom can't draw.
vi.mock("@/themes/textures", () => ({ prepareThemeTextures: vi.fn() }));
vi.mock("@/i18n", () => ({
  LOCALES: { en: "English", ar: "العربية" },
  loadLocale: locale.loadLocale,
}));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray | string, ...values: unknown[]) =>
      typeof parts === "string"
        ? parts
        : parts.reduce(
            (text, part, index) => `${text}${part}${values[index] ?? ""}`,
            "",
          ),
  }),
}));

let container: HTMLDivElement;
let root: Root;

function title() {
  return document.querySelector('[data-slot="dialog-title"]')?.textContent;
}

function button(label: string) {
  const match = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent?.trim() === label);
  expect(match, label).toBeDefined();
  return match!;
}

function buttonStartingWith(label: string) {
  const match = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent?.trim().startsWith(label));
  expect(match, label).toBeDefined();
  return match!;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

async function render(section: "appearance" | "prompting") {
  await act(async () =>
    root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(SettingsShell<"appearance" | "prompting">, {
          open: true,
          onOpenChange: () => {},
          title: createElement("span", null, "Settings"),
          description: createElement("span", null, "Settings"),
          defaultSection: section,
          sections: [
            {
              id: "appearance",
              label: createElement("span", null, "Appearance"),
              description: createElement("span", null, "Appearance"),
              groupId: "app",
              group: createElement("span", null, "App"),
              icon: Palette,
              component: SettingsGame,
              subpageTitle: AppearanceTitle,
            },
            {
              id: "prompting",
              label: createElement("span", null, "Prompting"),
              description: createElement("span", null, "Prompting"),
              groupId: "ai",
              group: createElement("span", null, "AI"),
              icon: Sparkles,
              component: SettingsAdvanced,
              subpageTitle: PromptingTitle,
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

describe("Prompting", () => {
  it("customises a prompt from the default and resets it", async () => {
    await render("prompting");
    expect(buttonStartingWith("AI instructions").textContent).toContain(
      "Default",
    );

    await click(buttonStartingWith("AI instructions"));
    expect(title()).toBe("AI instructions");
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(editor.readOnly).toBe(true);
    expect(editor.value).toBe(AI_INSTRUCTIONS_PROMPT);

    await click(button("Custom"));
    expect(useSettingsStore.getState()).toMatchObject({
      useCustomStorytellerPrompt: true,
      customStorytellerPrompt: AI_INSTRUCTIONS_PROMPT,
    });
    expect(editor.readOnly).toBe(false);

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(editor, "Narrate like a sea shanty.");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useSettingsStore.getState().customStorytellerPrompt).toBe(
      "Narrate like a sea shanty.",
    );
    expect(document.body.textContent).toContain("Edited");

    // Default keeps the custom text, so switching back restores it.
    await click(button("Default"));
    await click(button("Custom"));
    expect(editor.value).toBe("Narrate like a sea shanty.");

    await click(button("Reset to default"));
    expect(useSettingsStore.getState()).toMatchObject({
      useCustomStorytellerPrompt: false,
      customStorytellerPrompt: undefined,
    });
    expect(editor.value).toBe(AI_INSTRUCTIONS_PROMPT);
  });

  it("asks before resetting every prompt", async () => {
    useSettingsStore.setState({
      useCustomGmPrompt: true,
      customGmPrompt: "Custom rules",
    });
    await render("prompting");
    expect(buttonStartingWith("Game Master mechanics").textContent).toContain(
      "Custom",
    );

    await click(button("Reset all to default"));
    expect(useSettingsStore.getState().useCustomGmPrompt).toBe(true);
    const confirm = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    ].find((element) => element.textContent === "Reset")!;
    await click(confirm);
    expect(useSettingsStore.getState()).toMatchObject({
      useCustomGmPrompt: false,
      customGmPrompt: undefined,
    });
    expect(document.body.textContent).not.toContain("Reset all to default");
  });
});

describe("Appearance", () => {
  it("changes sizes, the latest-passage highlight, thinking, and direction", async () => {
    await render("appearance");
    expect(document.body.textContent).toContain("Brass Night");

    const textSize = document.querySelector('[aria-label="Text size"]')!;
    await click(
      textSize.querySelector<HTMLButtonElement>("button:last-child")!,
    );
    expect(useSettingsStore.getState().fontSize).toBe(1.1);
    expect(textSize.textContent).toContain("110%");

    const interfaceSize = document.querySelector(
      '[aria-label="Interface size"]',
    )!;
    await click(
      interfaceSize.querySelector<HTMLButtonElement>("button:first-child")!,
    );
    expect(useSettingsStore.getState().uiScale).toBe(0.9);

    await click(
      document.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Highlight the latest passage"]',
      )!,
    );
    expect(useSettingsStore.getState().highlightLatestSection).toBe(false);

    await click(button("Latest"));
    expect(useSettingsStore.getState().thinkingVisibility).toBe("latest");

    await click(button("Right to left"));
    expect(useSettingsStore.getState().textDirection).toBe("rtl");
  });

  it("picks a font and a language on their own pages", async () => {
    await render("appearance");

    await click(buttonStartingWith("Font"));
    expect(title()).toBe("Font");
    const fonts = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ];
    expect(fonts[0].getAttribute("aria-checked")).toBe("true");
    await click(fonts[1]);
    expect(useSettingsStore.getState().fontFamily).not.toBe("theme");

    await click(
      document.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!,
    );
    expect(title()).toBe("Appearance");

    await click(buttonStartingWith("Language"));
    expect(title()).toBe("Language");
    await click(button("العربية"));
    expect(useSettingsStore.getState().language).toBe("ar");
    expect(locale.loadLocale).toHaveBeenCalledWith("ar");
  });

  it("opens the theme gallery", async () => {
    await render("appearance");
    await click(buttonStartingWith("Brass Night"));
    expect(title()).toBe("Theme");
    expect(
      document.querySelector('[role="radiogroup"][aria-label="Theme"]'),
    ).not.toBeNull();
  });
});
