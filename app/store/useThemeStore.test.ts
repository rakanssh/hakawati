import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("useThemeStore", () => {
  it("starts from the saved theme, reading old ids", async () => {
    localStorage.setItem("vite-ui-theme", "cosmos");
    const { useThemeStore } = await import("./useThemeStore");
    expect(useThemeStore.getState().preference).toBe("orbit");
  });

  it("defaults to Brass Night and saves what is picked", async () => {
    const { useThemeStore } = await import("./useThemeStore");
    expect(useThemeStore.getState().preference).toBe("brass-night");
    useThemeStore.getState().setPreference("system");
    expect(localStorage.getItem("vite-ui-theme")).toBe("system");
  });
});
