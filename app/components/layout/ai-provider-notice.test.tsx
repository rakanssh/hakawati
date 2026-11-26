import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "@/lib/platform";
import { useSettingsStore } from "@/store/useSettingsStore";
import { AiProviderNotice } from "./ai-provider-notice";

const mocks = vi.hoisted(() => ({ platform: "ios" }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
}));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  detectPlatform: () => mocks.platform,
}));

describe("AI provider notice", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.platform = Platform.IOS;
    useSettingsStore.setState({ aiProviderNoticeAcknowledged: false });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const dialog = () => document.querySelector('[role="dialog"]');

  it("asks once on iPhone before any provider is used", () => {
    act(() => root.render(<AiProviderNotice />));
    expect(dialog()?.textContent).toContain("go to the provider you choose");

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(dialog()).not.toBeNull();

    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Continue",
    );
    act(() => button?.click());
    expect(useSettingsStore.getState().aiProviderNoticeAcknowledged).toBe(true);
    expect(dialog()).toBeNull();
  });

  it("stays away on other platforms", () => {
    mocks.platform = Platform.ANDROID;
    act(() => root.render(<AiProviderNotice />));
    expect(dialog()).toBeNull();
  });
});
