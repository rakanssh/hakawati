import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
const { loadLocale } = vi.hoisted(() => ({ loadLocale: vi.fn() }));
vi.mock("@/i18n", () => ({ loadLocale }));

const { useSettingsStore } = await import("@/store/useSettingsStore");
const { useThemeStore } = await import("@/store/useThemeStore");
const { changeRole, changeSetting, revertAppChanges } = await import(
  "./app-changes"
);

const initial = useSettingsStore.getState();

beforeEach(() => {
  useSettingsStore.setState(initial, true);
  useThemeStore.setState({ preference: "brass-night" });
  loadLocale.mockReset();
});

describe("changing settings", () => {
  it("records what it changed and reads names the player might use", () => {
    expect(changeSetting("theme", "Rain on Glass")).toEqual({
      kind: "setting",
      key: "theme",
      before: "brass-night",
      after: "rain-on-glass",
    });
    expect(useThemeStore.getState().preference).toBe("rain-on-glass");
    expect(changeSetting("fontSize", 9)).toMatchObject({ after: 4 });
    expect(changeSetting("language", "Arabic")).toMatchObject({ after: "ar" });
    expect(useSettingsStore.getState().language).toBe("ar");
  });

  it("returns nothing when the value is already set, and explains bad values", () => {
    expect(changeSetting("theme", "brass-night")).toBeNull();
    expect(() => changeSetting("theme", "neon")).toThrow(
      /theme must be one of/,
    );
    expect(() => changeSetting("volume", 3)).toThrow(
      /no setting called volume/,
    );
  });

  it("puts a prompt back to the built-in one with null", () => {
    changeSetting("storytellerPrompt", "Write like a sailor.");
    expect(useSettingsStore.getState()).toMatchObject({
      customStorytellerPrompt: "Write like a sailor.",
      useCustomStorytellerPrompt: true,
    });
    expect(changeSetting("storytellerPrompt", null)).toMatchObject({
      after: { custom: false, text: null },
    });
  });
});

describe("undoing setting and role changes", () => {
  it("reverts what still holds Hakawati's value and keeps the rest", () => {
    const theme = changeSetting("theme", "orbit")!;
    const size = changeSetting("fontSize", 1.5)!;
    useSettingsStore.getState().setFontSize(2);

    const { changes, kept } = revertAppChanges([theme, size]);
    expect(kept).toBe(1);
    expect(changes.map((change) => change.undone)).toEqual([true, undefined]);
    expect(useThemeStore.getState().preference).toBe("brass-night");
    expect(useSettingsStore.getState().fontSize).toBe(2);
  });

  it("switches the language back through the translations", () => {
    const change = changeSetting("language", "ar")!;
    revertAppChanges([change]);
    expect(useSettingsStore.getState().language).toBe("en");
  });

  it("restores a role's whole assignment", () => {
    const before = useSettingsStore.getState().roleAssignments.utility;
    const change = changeRole("utility", "Helper model", () =>
      useSettingsStore.getState().setRoleSameAsNarrator("utility", false),
    )!;
    expect(change).toMatchObject({ kind: "role", role: "utility" });
    expect(
      useSettingsStore.getState().roleAssignments.utility.sameAsNarrator,
    ).toBe(false);
    expect(revertAppChanges([change]).kept).toBe(0);
    expect(useSettingsStore.getState().roleAssignments.utility).toEqual(before);
  });
});
