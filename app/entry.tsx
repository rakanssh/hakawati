import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@lingui/react";
import { i18n, loadLocale, type Locale } from "./i18n";
import { AppRouter } from "./router";

// installDebugConsoleCapture();
// TODO: Re-enable debug console when it's fixed

// Load persisted language preference on startup
const storedSettings = localStorage.getItem("settings");
if (storedSettings) {
  try {
    const parsed = JSON.parse(storedSettings) as {
      state?: { language?: Locale };
    };
    const lang = parsed?.state?.language;
    if (lang && lang !== "en") {
      void loadLocale(lang);
    }
  } catch {
    // Ignore parse errors
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <AppRouter />
    </I18nProvider>
  </StrictMode>,
);
