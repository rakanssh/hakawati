import { useSyncExternalStore } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { resolveThemeScenery, type ThemeScenery } from "@/themes/registry";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION).matches;

/** Whether the system asks apps to reduce motion, kept current as it changes. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** The scenery to draw, following the system's reduced-motion preference until the reader picks one. */
export function useThemeScenery(): ThemeScenery {
  const chosen = useSettingsStore((state) => state.themeScenery);
  return resolveThemeScenery(chosen, usePrefersReducedMotion());
}
