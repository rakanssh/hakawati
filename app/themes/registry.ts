import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export type ThemeMode = "light" | "dark";

export const THEME_IDS = [
  "light",
  "dark",
  "brass-night",
  "orbit",
  "phosphor",
  "cartridge",
  "rain-on-glass",
  "storybook",
  "typewriter",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
/** What the user picked: a theme, or "system" to follow the OS light/dark setting. */
export type ThemePreference = ThemeId | "system";

/** The font setting that lets the active theme choose the story type. */
export const THEME_FONT = "theme";

/** How much of a theme's scenery to draw on the play screen. */
export type ThemeScenery = "animated" | "still" | "off";
export const THEME_SCENERY_OPTIONS = ["animated", "still", "off"] as const;

export interface ThemeDefinition {
  id: ThemeId;
  mode: ThemeMode;
  name: MessageDescriptor;
  description: MessageDescriptor;
  /** Google Fonts `family=` parameters for the theme's own type, loaded on demand. */
  fonts?: string[];
  /** The theme's lettering, for showing its name in the picker, and how much to enlarge it. */
  nameFont?: string;
  nameScale?: number;
}

export const themes: readonly ThemeDefinition[] = [
  {
    id: "light",
    mode: "light",
    name: msg`Light`,
    description: msg`Off-white with a teal accent.`,
  },
  {
    id: "dark",
    mode: "dark",
    name: msg`Dark`,
    description: msg`Neutral charcoal with a soft white accent.`,
  },
  {
    id: "brass-night",
    mode: "dark",
    name: msg`Brass Night`,
    description: msg`Deep teal, cream and brass, set in classic book type.`,
    fonts: ["Cinzel:wght@500;600", "EB+Garamond:ital,wght@0,400;0,500;1,400"],
    nameFont: '"Cinzel", Georgia, serif',
  },
  {
    id: "orbit",
    mode: "dark",
    name: msg`Orbit`,
    description: msg`A starship tablet against a night sky and a slowly turning red planet.`,
    fonts: [
      "Barlow:ital,wght@0,400;0,500;0,600;1,400",
      "Rajdhani:wght@500;600;700",
    ],
    nameFont: '"Rajdhani", "Arial Narrow", sans-serif',
  },
  {
    id: "phosphor",
    mode: "dark",
    name: msg`Phosphor`,
    description: msg`A green-screen terminal with glowing type.`,
    fonts: ["VT323"],
    nameFont: '"VT323", ui-monospace, monospace',
    nameScale: 1.3,
  },
  {
    id: "cartridge",
    mode: "dark",
    name: msg`Cartridge`,
    description: msg`An 8-bit sunset over a castle, with pixel type.`,
    fonts: ["Pixelify+Sans:wght@400;600", "Press+Start+2P"],
    nameFont: '"Pixelify Sans", ui-monospace, monospace',
  },
  {
    id: "rain-on-glass",
    mode: "light",
    name: msg`Rain on Glass`,
    description: msg`A grey afternoon through a misted city window.`,
  },
  {
    id: "storybook",
    mode: "light",
    name: msg`Storybook`,
    description: msg`Watercolour corners and crayon doodles.`,
    fonts: ["Shantell+Sans:wght@400;500;600"],
    nameFont: '"Shantell Sans", "Comic Sans MS", cursive',
  },
  {
    id: "typewriter",
    mode: "light",
    name: msg`Typewriter`,
    description: msg`A sheet feeding out of a typewriter on an oak desk.`,
    fonts: ["Courier+Prime:ital,wght@0,400;0,700;1,400"],
    nameFont: '"Courier Prime", "Courier New", monospace',
  },
];

const themesById = new Map(themes.map((theme) => [theme.id, theme]));

/** Retired themes map to their closest replacement so returning users keep a similar look. */
const LEGACY_THEME_IDS: Record<string, ThemeId> = {
  bamboo: "light",
  cosmos: "orbit",
};

export const themeClassNames = THEME_IDS.map((id) => `theme-${id}`);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themesById.has(value as ThemeId);
}

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference | undefined {
  if (value === "system" || isThemeId(value)) return value;
  if (value && value in LEGACY_THEME_IDS) return LEGACY_THEME_IDS[value];
  return undefined;
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return themesById.get(id) ?? themes[0];
}

export function getSystemThemeId(): ThemeId {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveThemePreference(preference: ThemePreference): ThemeId {
  return preference === "system" ? getSystemThemeId() : preference;
}

export function isThemeScenery(value: unknown): value is ThemeScenery {
  return THEME_SCENERY_OPTIONS.includes(value as ThemeScenery);
}

/** The scenery to draw: the reader's choice, otherwise still when the system asks for reduced motion. */
export function resolveThemeScenery(
  chosen: ThemeScenery | undefined,
  prefersReducedMotion: boolean,
): ThemeScenery {
  return chosen ?? (prefersReducedMotion ? "still" : "animated");
}
