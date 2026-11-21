import { create } from "zustand";
import { parseThemePreference, type ThemePreference } from "@/themes/registry";

const STORAGE_KEY = "vite-ui-theme";
export const DEFAULT_THEME: ThemePreference = "brass-night";

function savedPreference(): ThemePreference {
  try {
    return (
      parseThemePreference(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_THEME
    );
  } catch {
    return DEFAULT_THEME;
  }
}

interface ThemeStoreType {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeStoreType>()((set) => ({
  preference: savedPreference(),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Storage can be unavailable; the choice still applies for this session.
    }
    set({ preference });
  },
}));
