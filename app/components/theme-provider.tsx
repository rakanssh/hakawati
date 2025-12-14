import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import {
  useSettingsStore,
  resolveTextDirection,
} from "@/store/useSettingsStore";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
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

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

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
    setTheme: (theme: Theme) => {
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
