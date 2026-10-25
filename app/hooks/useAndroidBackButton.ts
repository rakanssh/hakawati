import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { t } from "@lingui/core/macro";
import { toast } from "sonner";
import { flushPendingAutoSaves } from "./useAutoSave";
import { Platform } from "@/lib/platform";
import { useIsMobile } from "./useIsMobile";

// Radix layers (dialogs, drawers, sheets, menus, popovers, selects) close on Escape.
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  "[data-radix-popper-content-wrapper]",
].join(", ");

/**
 * Android's back gesture closes the topmost layer first, then walks back
 * through history, and only leaves the app from the home screen.
 */
export function useAndroidBackButton() {
  const { platform } = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    if (platform !== Platform.ANDROID) return;

    let disposed = false;
    let unregister: (() => Promise<void>) | undefined;
    let leaving = false;

    // Leaving a page can start a save, so wait for it; exiting mid-write
    // would lose the change. A failed save keeps the app open to retry.
    const exitAfterSaving = async () => {
      if (leaving) return;
      leaving = true;
      try {
        await flushPendingAutoSaves();
      } catch (error) {
        leaving = false;
        console.error("Unable to save before leaving:", error);
        toast.error(
          t`Couldn't save your progress, so Hakawati stayed open. Go back again to retry.`,
        );
        return;
      }
      await exit(0).catch((error) => {
        leaving = false;
        console.error("Unable to leave the app:", error);
      });
    };

    void onBackButtonPress(({ canGoBack }) => {
      if (document.querySelector(OPEN_LAYER_SELECTOR)) {
        // Radix listens on the document during capture. Not bubbling keeps the
        // app's window-level Escape shortcuts from firing as well.
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
        );
        return;
      }
      if (window.location.pathname === "/") {
        void exitAfterSaving();
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        void navigate({ to: "/" });
      }
    }).then((listener) => {
      if (disposed) void listener.unregister();
      else unregister = () => listener.unregister();
    });

    return () => {
      disposed = true;
      void unregister?.();
    };
  }, [platform, navigate]);
}
