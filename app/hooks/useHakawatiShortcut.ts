import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { detectPlatform, Platform } from "@/lib/platform";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";

export const HAKAWATI_SHORTCUT =
  detectPlatform() === Platform.MACOS ||
  (typeof navigator !== "undefined" && /mac/i.test(navigator.platform))
    ? "⌘K"
    : "Ctrl+K";

const otherDialogOpen = () =>
  [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(
    (dialog) => !dialog.closest("[data-story-panel]"),
  );

export function useHakawatiShortcut() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isPlay = useRef(false);
  isPlay.current = pathname.startsWith("/play");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyK" ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        otherDialogOpen()
      )
        return;
      event.preventDefault();
      const panel = useStoryPanelStore.getState();
      const active = document.activeElement;
      if (panel.open && active?.hasAttribute("data-hakawati-composer")) {
        (active as HTMLElement).blur();
        panel.setOpen(false);
        return;
      }
      if (isPlay.current) panel.setTab("hakawati");
      panel.setOpen(true);
      useAssistantStore.getState().requestComposerFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
