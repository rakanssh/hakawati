import { i18n } from "@lingui/core";
import { messages as enMessages } from "./locales/en/messages.po";

export type Locale = "en" | "ar";

export const LOCALES: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

i18n.load("en", enMessages);
i18n.activate("en");

/**
 * Dynamically load and activate a locale.
 * @param locale - The locale to load and activate.
 * @returns A promise that resolves when the locale is loaded and activated.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale === "en") {
    i18n.activate("en");
    return;
  }

  const { messages } = await import(`./locales/${locale}/messages.po`);
  i18n.load(locale, messages);
  i18n.activate(locale);
}

export { i18n } from "@lingui/core";
