import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_IDS,
  getTheme,
  isThemeScenery,
  parseThemePreference,
  resolveThemePreference,
  themes,
} from "./registry";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const stylesDir = path.resolve(__dirname, "styles");
const stylesheets = readdirSync(stylesDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(path.join(stylesDir, file), "utf8"))
  .join("\n");

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query === "(prefers-color-scheme: dark)",
    })),
  );
}

describe("theme registry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defines every theme exactly once", () => {
    expect(themes.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  });

  it("has a stylesheet with colour tokens for every theme", () => {
    for (const id of THEME_IDS) {
      const block = new RegExp(`\\.theme-${id}\\s*\\{[^}]*--background:`);
      expect(stylesheets, id).toMatch(block);
    }
  });

  it("reads stored preferences, mapping retired themes to their replacements", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("typewriter")).toBe("typewriter");
    expect(parseThemePreference("cosmos")).toBe("orbit");
    expect(parseThemePreference("bamboo")).toBe("light");
    expect(parseThemePreference("sumi")).toBeUndefined();
    expect(parseThemePreference(null)).toBeUndefined();
  });

  it("resolves the system preference to light or dark", () => {
    mockSystemDark(true);
    expect(resolveThemePreference("system")).toBe("dark");
    mockSystemDark(false);
    expect(resolveThemePreference("system")).toBe("light");
    expect(resolveThemePreference("cartridge")).toBe("cartridge");
  });

  it("describes each theme's mode", () => {
    expect(getTheme("brass-night").mode).toBe("dark");
    expect(getTheme("storybook").mode).toBe("light");
  });

  it("recognises scenery settings", () => {
    expect(isThemeScenery("still")).toBe(true);
    expect(isThemeScenery("moving")).toBe(false);
  });
});
