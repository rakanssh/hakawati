import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@lingui/react";
import { invoke } from "@tauri-apps/api/core";
import { i18n, loadLocale, type Locale } from "./i18n";
import { AppRouter } from "./router";
import {
  MigrationRecoveryScreen,
  type MigrationRecoveryStatus,
} from "./components/migration-recovery-screen";

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

const reactRoot = createRoot(root);

async function bootstrap() {
  const recoveryStatus =
    "__TAURI_INTERNALS__" in window
      ? await invoke<MigrationRecoveryStatus | null>(
          "migration_recovery_status",
        )
      : null;

  reactRoot.render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        {recoveryStatus ? (
          <MigrationRecoveryScreen status={recoveryStatus} />
        ) : (
          <AppRouter />
        )}
      </I18nProvider>
    </StrictMode>,
  );
}

void bootstrap();
