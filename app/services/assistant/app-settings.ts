import { fontPresets } from "@/data/font-presets";
import { LOCALES, type Locale } from "@/lib/locales";
import { setAppLanguage } from "@/services/language";
import type { SettingsTab } from "@/store/useSettingsModalStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { DEFAULT_THEME, useThemeStore } from "@/store/useThemeStore";
import { THEME_FONT, THEME_IDS, type ThemeScenery } from "@/themes/registry";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "@/lib/appearance-limits";

/** One setting Hakawati can read and change. Values are what the store holds, so Undo can put them back. */
export interface SettingEntry {
  tab: SettingsTab;
  read: () => unknown;
  apply: (value: unknown) => void;
  /** Turns what the model sent into a stored value, or explains why it can't. `null` asks for the default. */
  parse: (input: unknown) => unknown;
  /** What `get` tells the model the setting accepts. */
  accepts: unknown;
}

const settings = () => useSettingsStore.getState();
const squash = (value: string) =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function oneOf<T extends string>(
  name: string,
  values: readonly T[],
  aliases: Record<string, T> = {},
) {
  return (input: unknown): T => {
    if (typeof input === "string") {
      const key = squash(input);
      const found =
        values.find((value) => squash(value) === key) ?? aliases[key];
      if (found) return found;
    }
    throw new Error(`${name} must be one of: ${values.join(", ")}.`);
  };
}

function number(
  name: string,
  min: number,
  max: number,
  options: { integer?: boolean; nullable?: boolean } = {},
) {
  return (input: unknown): number | null => {
    if (input === null && options.nullable) return null;
    const value = typeof input === "string" ? Number(input) : input;
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(
        `${name} must be a number${options.nullable ? " or null for the default" : ""}.`,
      );
    const clamped = Math.min(max, Math.max(min, value));
    return options.integer
      ? Math.round(clamped)
      : Math.round(clamped * 100) / 100;
  };
}

function boolean(name: string) {
  return (input: unknown): boolean => {
    if (typeof input === "boolean") return input;
    throw new Error(`${name} must be true or false.`);
  };
}

type SamplingKey =
  | "temperature"
  | "topP"
  | "topK"
  | "minP"
  | "topA"
  | "frequencyPenalty"
  | "presencePenalty"
  | "repetitionPenalty";

function sampling(
  key: SamplingKey,
  min: number,
  max: number,
  integer = false,
): SettingEntry {
  const setters = {
    temperature: "setTemperature",
    topP: "setTopP",
    topK: "setTopK",
    minP: "setMinP",
    topA: "setTopA",
    frequencyPenalty: "setFrequencyPenalty",
    presencePenalty: "setPresencePenalty",
    repetitionPenalty: "setRepetitionPenalty",
  } as const;
  return {
    tab: "generation",
    read: () => settings()[key] ?? null,
    apply: (value) => settings()[setters[key]](value as number | null),
    parse: number(key, min, max, { integer, nullable: true }),
    accepts: { min, max, default: null },
  };
}

type PromptKey =
  | "Storyteller"
  | "Gm"
  | "Continue"
  | "ContinueAuthorNote"
  | "StoryCardGenerator";

const PROMPT_FIELDS: Record<PromptKey, { text: string; use: string }> = {
  Storyteller: {
    text: "customStorytellerPrompt",
    use: "useCustomStorytellerPrompt",
  },
  Gm: { text: "customGmPrompt", use: "useCustomGmPrompt" },
  Continue: { text: "customContinuePrompt", use: "useCustomContinuePrompt" },
  ContinueAuthorNote: {
    text: "customContinueAuthorNote",
    use: "useCustomContinueAuthorNote",
  },
  StoryCardGenerator: {
    text: "customStoryCardGeneratorPrompt",
    use: "useCustomStoryCardGeneratorPrompt",
  },
};

function prompt(key: PromptKey): SettingEntry {
  const fields = PROMPT_FIELDS[key];
  type Stored = { custom: boolean; text: string | null };
  return {
    tab: "prompting",
    read: (): Stored => {
      const state = settings() as unknown as Record<string, unknown>;
      return {
        custom: Boolean(state[fields.use]),
        text: (state[fields.text] as string | undefined) ?? null,
      };
    },
    apply: (value) => {
      const { custom, text } = value as Stored;
      useSettingsStore.setState({
        [fields.text]: text ?? undefined,
        [fields.use]: custom,
      });
    },
    parse: (input): Stored => {
      if (input === null) return { custom: false, text: null };
      if (typeof input === "string" && input.trim())
        return { custom: true, text: input };
      throw new Error(
        "A prompt must be its full text, or null to go back to the built-in one.",
      );
    },
    accepts: "the full prompt text, or null for the built-in prompt",
  };
}

const THEME_PREFERENCES = ["system", ...THEME_IDS] as const;
const SCENERY = ["animated", "still", "off"] as const;
const LANGUAGES = Object.keys(LOCALES) as Locale[];
const FONT_IDS = fontPresets.map((font) => font.id);

const fontId = (value: string) =>
  fontPresets.find((font) => font.value === value)?.id ?? value;

export const APP_SETTINGS: Record<string, SettingEntry> = {
  theme: {
    tab: "appearance",
    read: () => useThemeStore.getState().preference,
    apply: (value) =>
      useThemeStore
        .getState()
        .setPreference(
          (value as (typeof THEME_PREFERENCES)[number] | null) ?? DEFAULT_THEME,
        ),
    parse: (input) =>
      input === null
        ? DEFAULT_THEME
        : oneOf("theme", THEME_PREFERENCES, {
            auto: "system",
            followsystem: "system",
          })(input),
    accepts: THEME_PREFERENCES,
  },
  scenery: {
    tab: "appearance",
    read: () => settings().themeScenery ?? null,
    apply: (value) =>
      value === null
        ? useSettingsStore.setState({ themeScenery: undefined })
        : settings().setThemeScenery(value as ThemeScenery),
    parse: (input) =>
      input === null ? null : oneOf("scenery", SCENERY)(input),
    accepts: [...SCENERY, "null to follow the system's reduce-motion setting"],
  },
  fontSize: {
    tab: "appearance",
    read: () => settings().fontSize,
    apply: (value) => settings().setFontSize(value as number),
    parse: (input) =>
      input === null
        ? 1
        : number("fontSize", FONT_SIZE_MIN, FONT_SIZE_MAX)(input),
    accepts: { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX, default: 1 },
  },
  uiScale: {
    tab: "appearance",
    read: () => settings().uiScale,
    apply: (value) => settings().setUiScale(value as number),
    parse: (input) =>
      input === null ? 1 : number("uiScale", UI_SCALE_MIN, UI_SCALE_MAX)(input),
    accepts: { min: UI_SCALE_MIN, max: UI_SCALE_MAX, default: 1 },
  },
  font: {
    tab: "appearance",
    read: () => fontId(settings().fontFamily),
    apply: (value) =>
      settings().setFontFamily(
        fontPresets.find((font) => font.id === value)?.value ?? THEME_FONT,
      ),
    parse: (input) => {
      if (input === null) return THEME_FONT;
      if (typeof input === "string") {
        const key = squash(input);
        const font = fontPresets.find(
          (preset) => squash(preset.id) === key || squash(preset.name) === key,
        );
        if (font) return font.id;
      }
      throw new Error(`font must be one of: ${FONT_IDS.join(", ")}.`);
    },
    accepts: fontPresets.map((font) => ({ id: font.id, name: font.name })),
  },
  highlightLatest: {
    tab: "appearance",
    read: () => settings().highlightLatestSection,
    apply: (value) => settings().setHighlightLatestSection(value as boolean),
    parse: (input) =>
      input === null ? true : boolean("highlightLatest")(input),
    accepts: "true or false",
  },
  thinking: {
    tab: "appearance",
    read: () => settings().thinkingVisibility,
    apply: (value) =>
      settings().setThinkingVisibility(value as "all" | "latest" | "none"),
    parse: (input) =>
      input === null
        ? "all"
        : oneOf("thinking", ["all", "latest", "none"] as const)(input),
    accepts: ["all", "latest", "none"],
  },
  language: {
    tab: "appearance",
    read: () => settings().language,
    apply: (value) => setAppLanguage(value as Locale),
    parse: (input) =>
      input === null
        ? "en"
        : oneOf("language", LANGUAGES, {
            english: "en",
            arabic: "ar",
            [squash("العربية")]: "ar",
          } as Record<string, Locale>)(input),
    accepts: LOCALES,
  },
  direction: {
    tab: "appearance",
    read: () => settings().textDirection,
    apply: (value) =>
      settings().setTextDirection(value as "system" | "ltr" | "rtl"),
    parse: (input) =>
      input === null
        ? "system"
        : oneOf("direction", ["system", "ltr", "rtl"] as const)(input),
    accepts: ["system", "ltr", "rtl"],
  },
  autoNarrate: {
    tab: "ai-setup",
    read: () => settings().autoNarrate,
    apply: (value) => settings().setAutoNarrate(value as boolean),
    parse: (input) => (input === null ? false : boolean("autoNarrate")(input)),
    accepts: "true or false: read new narration aloud",
  },
  contextWindow: {
    tab: "generation",
    read: () => settings().contextWindow,
    apply: (value) => settings().setContextWindow(value as number),
    parse: (input) => {
      const limit = settings().modelContextLength || 2_000_000;
      return input === null
        ? Math.min(10000, limit)
        : number("contextWindow", 512, limit, { integer: true })(input);
    },
    get accepts() {
      return { min: 512, max: settings().modelContextLength || null };
    },
  },
  maxTokens: {
    tab: "generation",
    read: () => settings().maxTokens,
    apply: (value) => settings().setMaxTokens(value as number),
    parse: (input) =>
      input === null
        ? 2048
        : number("maxTokens", 1, settings().modelContextLength || 1_000_000, {
            integer: true,
          })(input),
    accepts: { min: 1, default: 2048 },
  },
  temperature: sampling("temperature", 0, 2),
  topP: sampling("topP", 0, 1),
  topK: sampling("topK", 1, 1000, true),
  minP: sampling("minP", 0, 1),
  topA: sampling("topA", 0, 1),
  frequencyPenalty: sampling("frequencyPenalty", -2, 2),
  presencePenalty: sampling("presencePenalty", -2, 2),
  repetitionPenalty: sampling("repetitionPenalty", 0, 10),
  seed: {
    tab: "generation",
    read: () => settings().seed,
    apply: (value) => settings().setSeed(value as number),
    parse: (input) =>
      input === null
        ? Math.floor(Math.random() * 1_000_000)
        : number("seed", 0, Number.MAX_SAFE_INTEGER, { integer: true })(input),
    accepts: "a whole number, or null for a new random one",
  },
  storytellerPrompt: prompt("Storyteller"),
  gmPrompt: prompt("Gm"),
  continuePrompt: prompt("Continue"),
  continueAuthorNote: prompt("ContinueAuthorNote"),
  storyCardPrompt: prompt("StoryCardGenerator"),
};

export const SETTING_KEYS = Object.keys(APP_SETTINGS);
