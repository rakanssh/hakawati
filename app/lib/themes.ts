export type ResolvedThemeId = "light" | "dark" | "fantasy" | "scifi";
export type ThemeId = ResolvedThemeId | "system";
export type ThemeBaseMode = "light" | "dark";

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  icon: "monitor" | "sun" | "moon" | "scroll" | "rocket";
  baseMode?: ThemeBaseMode;
};

export const themeDefinitions = [
  {
    id: "system",
    label: "System",
    icon: "monitor",
  },
  {
    id: "light",
    label: "Light",
    icon: "sun",
    baseMode: "light",
  },
  {
    id: "dark",
    label: "Dark",
    icon: "moon",
    baseMode: "dark",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    icon: "scroll",
    baseMode: "light",
  },
  {
    id: "scifi",
    label: "Sci-Fi",
    icon: "rocket",
    baseMode: "dark",
  },
] as const satisfies readonly ThemeDefinition[];

export const resolvedThemeIds = [
  "light",
  "dark",
  "fantasy",
  "scifi",
] as const satisfies readonly ResolvedThemeId[];

export const themeIds = themeDefinitions.map((theme) => theme.id) as ThemeId[];

export const themeClassNames = resolvedThemeIds.map(
  (theme) => `theme-${theme}`,
);

export function isThemeId(value: string | null): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

export function resolveSystemTheme(): ResolvedThemeId {
  if (typeof window === "undefined") return "light";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveThemeId(theme: ThemeId): ResolvedThemeId {
  return theme === "system" ? resolveSystemTheme() : theme;
}

export function getThemeDefinition(theme: ThemeId): ThemeDefinition {
  return (
    themeDefinitions.find((definition) => definition.id === theme) ??
    themeDefinitions[0]
  );
}

export function getResolvedThemeDefinition(
  theme: ResolvedThemeId,
): ThemeDefinition & { baseMode: ThemeBaseMode } {
  const definition = themeDefinitions.find((item) => item.id === theme);
  if (!definition || !("baseMode" in definition)) {
    return themeDefinitions[1] as ThemeDefinition & {
      baseMode: ThemeBaseMode;
    };
  }
  return definition as ThemeDefinition & { baseMode: ThemeBaseMode };
}
