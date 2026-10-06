import type { ThemeDefinition } from "./registry";

const requested = new Set<string>();

/** Adds the theme's Google Fonts stylesheet the first time it is needed. Offline, the CSS fallbacks apply. */
export function loadThemeFonts(theme: ThemeDefinition) {
  if (!theme.fonts?.length || typeof document === "undefined") return;
  if (requested.has(theme.id)) return;
  requested.add(theme.id);

  const families = theme.fonts.map((family) => `family=${family}`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  link.dataset.themeFonts = theme.id;
  document.head.append(link);
}
