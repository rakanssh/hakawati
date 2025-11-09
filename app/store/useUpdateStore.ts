import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "installing"
  | "upToDate"
  | "error"
  | "unsupported";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseDate?: string;
  notes?: string;
}

interface CheckOptions {
  suppressUpToDateToast?: boolean;
}

interface UpdateState {
  phase: UpdatePhase;
  checkedAt: Date | null;
  errorMessage: string | null;
  downloadedBytes: number;
  updateInfo: UpdateInfo | null;
  updateResource: Update | null;
  hasNotification: boolean;
  pendingChangelogVersion: string | null;
  pendingChangelogNotes: string | null;
  checkForUpdates: (options?: CheckOptions) => Promise<void>;
  installUpdate: () => Promise<void>;
  markNotificationSeen: () => void;
  clearPendingChangelog: () => void;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function closeUpdate(update: Update | null | undefined) {
  try {
    if (update) {
      await update.close();
    }
  } catch (_error) {
    // ignore close errors
  }
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      phase: isTauriEnvironment() ? "idle" : "unsupported",
      checkedAt: null,
      errorMessage: null,
      downloadedBytes: 0,
      updateInfo: null,
      updateResource: null,
      hasNotification: false,
      pendingChangelogVersion: null,
      pendingChangelogNotes: null,

      checkForUpdates: async (options) => {
        if (!isTauriEnvironment()) {
          set({ phase: "unsupported" });
          toast.info("Manual updates are only available in the desktop app.");
          return;
        }

        if (get().phase === "checking") {
          return;
        }

        set({ phase: "checking", errorMessage: null, downloadedBytes: 0 });

        try {
          const update = await check();
          const now = new Date();
          set({ checkedAt: now });

          if (!update) {
            const existing = get().updateResource;
            if (existing) {
              await closeUpdate(existing);
            }

            set({
              updateInfo: null,
              updateResource: null,
              hasNotification: false,
              downloadedBytes: 0,
              phase: "upToDate",
            });

            if (!options?.suppressUpToDateToast) {
              toast.success("Hakawati is up to date.");
            }
            return;
          }

          const previous = get().updateResource;
          if (previous) {
            await closeUpdate(previous);
          }

          set({
            updateInfo: {
              version: update.version,
              currentVersion: update.currentVersion,
              releaseDate: update.date,
              notes: update.body,
            },
            updateResource: update,
            downloadedBytes: 0,
            phase: "available",
            hasNotification: true,
            errorMessage: null,
          });

          toast.info(`Update ${update.version} is available.`, {
            duration: 10000,
            action: {
              label: "Install",
              onClick: () => {
                void get().installUpdate();
              },
            },
            closeButton: true,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          set({
            phase: "error",
            errorMessage: message,
            updateInfo: get().updateInfo,
            checkedAt: new Date(),
          });
          toast.error("Failed to check for updates.");
        }
      },

      installUpdate: async () => {
        const update = get().updateResource;
        if (!update) {
          return;
        }

        if (!isTauriEnvironment()) {
          set({ phase: "unsupported" });
          toast.info("Manual updates are only available in the desktop app.");
          return;
        }

        const updateInfo = get().updateInfo;
        if (updateInfo) {
          set({
            pendingChangelogVersion: updateInfo.version,
            pendingChangelogNotes: updateInfo.notes ?? null,
          });
        }

        set({ phase: "installing", errorMessage: null, downloadedBytes: 0 });

        try {
          await update.downloadAndInstall((event) => {
            if (event.event === "Progress") {
              const chunkLength = event.data?.chunkLength ?? 0;
              if (chunkLength > 0) {
                set((state) => ({
                  downloadedBytes: state.downloadedBytes + chunkLength,
                }));
              }
            }
          });

          toast.success(
            "Update downloaded. Restart the app to apply the update.",
          );

          set({
            phase: "idle",
            updateInfo: null,
            updateResource: null,
            downloadedBytes: 0,
            hasNotification: false,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          set({ phase: "error", errorMessage: message });
          toast.error("Failed to install the update.");
          set({
            pendingChangelogVersion: null,
            pendingChangelogNotes: null,
          });
        } finally {
          await closeUpdate(update);
          set({ updateResource: null });
        }
      },

      markNotificationSeen: () => {
        if (get().hasNotification) {
          set({ hasNotification: false });
        }
      },

      clearPendingChangelog: () => {
        set({
          pendingChangelogVersion: null,
          pendingChangelogNotes: null,
        });
      },
    }),
    {
      name: "update-store",
      partialize: (state) => ({
        pendingChangelogVersion: state.pendingChangelogVersion,
        pendingChangelogNotes: state.pendingChangelogNotes,
      }),
    },
  ),
);
