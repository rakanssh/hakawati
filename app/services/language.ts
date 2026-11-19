import type { Locale } from "@/lib/locales";
import { useSettingsStore } from "@/store/useSettingsStore";

export function setAppLanguage(code: Locale) {
  useSettingsStore.getState().setLanguage(code);
  void import("@/i18n").then(({ loadLocale }) => loadLocale(code));
}
