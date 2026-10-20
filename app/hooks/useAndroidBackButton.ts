import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { Platform, useIsMobile } from "./useIsMobile";

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
        void exit(0);
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
