import { useDebugConsoleStore, type DebugConsoleLevel } from "@/store";
import { useSettingsStore } from "@/store/useSettingsStore";

const LOG_METHODS = ["debug", "info", "log", "warn", "error"] as const;

declare global {
  interface Window {
    __hakawatiConsoleCaptureInstalled?: boolean;
  }
}

export function installDebugConsoleCapture() {
  if (typeof window === "undefined") return;
  if (window.__hakawatiConsoleCaptureInstalled) return;

  window.__hakawatiConsoleCaptureInstalled = true;

  for (const method of LOG_METHODS) {
    const original = console[method].bind(console);
    const level = method as DebugConsoleLevel;

    console[method] = ((...args: unknown[]) => {
      original(...(args as Parameters<typeof original>));

      try {
        if (!useSettingsStore.getState().debugConsoleEnabled) return;
        useDebugConsoleStore.getState().addEntry(level, args);
      } catch {
        // Avoid breaking runtime logging if capture fails.
      }
    }) as Console[typeof method];
  }
}
