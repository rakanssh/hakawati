import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import {
  useSettingsStore,
  resolveTextDirection,
} from "@/store/useSettingsStore";
import {
  getResolvedThemeDefinition,
  isThemeId,
  resolveThemeId,
  themeClassNames,
  themeDefinitions,
  type ResolvedThemeId,
  type ThemeId,
} from "@/lib/themes";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: ThemeId;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: ThemeId;
  resolvedTheme: ResolvedThemeId;
  themes: typeof themeDefinitions;
  setTheme: (theme: ThemeId) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  themes: themeDefinitions,
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const uiScale = useSettingsStore((state) => state.uiScale);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const textDirection = useSettingsStore((state) => state.textDirection);
  const language = useSettingsStore((state) => state.language);

  const resolvedDirection = useMemo(
    () => resolveTextDirection(textDirection, language),
    [textDirection, language],
  );

  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const storedTheme = localStorage.getItem(storageKey);
      return isThemeId(storedTheme) ? storedTheme : defaultTheme;
    } catch {
      return defaultTheme;
    }
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedThemeId>(() =>
    resolveThemeId(theme),
  );

  useEffect(() => {
    const updateResolvedTheme = () => setResolvedTheme(resolveThemeId(theme));
    updateResolvedTheme();

    if (theme !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateResolvedTheme);
    return () => mediaQuery.removeEventListener("change", updateResolvedTheme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const definition = getResolvedThemeDefinition(resolvedTheme);

    root.classList.remove("light", "dark", ...themeClassNames);
    root.classList.add(`theme-${resolvedTheme}`);
    if (definition.baseMode === "dark") {
      root.classList.add("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--ui-scale", uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--font-family", fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dir = resolvedDirection;
  }, [resolvedDirection]);

  const value = {
    theme,
    resolvedTheme,
    themes: themeDefinitions,
    setTheme: (theme: ThemeId) => {
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        //ignore
      }
      setTheme(theme);
    },
  };

  return (
    <DirectionProvider dir={resolvedDirection}>
      <ThemeProviderContext.Provider {...props} value={value}>
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
