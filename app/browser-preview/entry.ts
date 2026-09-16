import { seedPreview } from "./seed";
import { PREVIEW_BASE_URL, PREVIEW_MODEL } from "./native";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { useVersionStore } from "@/store/useVersionStore";
import { version } from "../../package.json";

async function startPreview() {
  if ("__TAURI_INTERNALS__" in window)
    throw new Error("Use the normal dev command for the desktop app.");
  document.title = "Hakawati · Browser preview";
  // A reload recreates disposable data; previously created route IDs expire.
  window.history.replaceState(null, "", "/");
  const settings = useSettingsStore.getState();
  settings.setOpenAiBaseUrl(PREVIEW_BASE_URL);
  settings.setApiKey("");
  settings.setModel(PREVIEW_MODEL);
  useSyncSettingsStore.getState().clearSession();
  useSyncSettingsStore.getState().setCloudBaseUrl("");
  useSyncSettingsStore.getState().setPersonalBaseUrl("");
  useVersionStore.getState().setLastSeenVersion(version);
  useLastPlayedStore.getState().setLastPlayedTaleId(await seedPreview());
  await import("../entry");
}

void startPreview().catch((error) => {
  console.error("Browser preview failed to initialize", error);
  const root = document.getElementById("root");
  if (root) root.textContent = `Browser preview failed: ${String(error)}`;
});
