import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import {
  useSettingsStore,
  resolveTextDirection,
} from "@/store/useSettingsStore";
import {
  THEME_FONT,
  getTheme,
  parseThemePreference,
  resolveThemePreference,
  themeClassNames,
  type ThemeDefinition,
  type ThemePreference,
} from "@/themes/registry";
import { loadThemeFonts } from "@/themes/fonts";
import { prepareThemeTextures } from "@/themes/textures";
import { useThemeScenery } from "@/hooks/useThemeScenery";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  storageKey?: string;
};

type ThemeProviderState = {
  /** What the user picked, which may be "system". */
  preference: ThemePreference;
  /** The theme actually on screen. */
  theme: ThemeDefinition;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

function useSystemPrefersDark() {
  const query = "(prefers-color-scheme: dark)";
  const [prefersDark, setPrefersDark] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setPrefersDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return prefersDark;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
  const uiScale = useSettingsStore((state) => state.uiScale);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const scenery = useThemeScenery();
  const textDirection = useSettingsStore((state) => state.textDirection);
  const language = useSettingsStore((state) => state.language);

  const resolvedDirection = useMemo(
    () => resolveTextDirection(textDirection, language),
    [textDirection, language],
  );

  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      return (
        parseThemePreference(localStorage.getItem(storageKey)) ?? defaultTheme
      );
    } catch {
      return defaultTheme;
    }
  });
  // Re-resolve "system" whenever the OS switches between light and dark.
  const systemPrefersDark = useSystemPrefersDark();
  const theme = useMemo(
    () => getTheme(resolveThemePreference(preference)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preference, systemPrefersDark],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", ...themeClassNames);
    root.classList.add(`theme-${theme.id}`, theme.mode);
    loadThemeFonts(theme);
    prepareThemeTextures(theme.id);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.scenery = scenery;
  }, [scenery]);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    // "theme" leaves the type to the theme; anything else overrides it everywhere.
    const root = document.documentElement;
    if (fontFamily === THEME_FONT) {
      root.style.removeProperty("--font-family");
      root.dataset.font = "theme";
    } else {
      root.style.setProperty("--font-family", fontFamily);
      root.dataset.font = "custom";
    }
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.dir = resolvedDirection;
  }, [resolvedDirection]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Storage can be unavailable; the choice still applies for this session.
      }
      setPreferenceState(next);
    },
    [storageKey],
  );

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );

  return (
    <DirectionProvider dir={resolvedDirection}>
      <ThemeProviderContext.Provider value={value}>
        {children}
      </ThemeProviderContext.Provider>
    </DirectionProvider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
