/**
 *
 * Hakawati is an AI-powered, text-based RPG client.
 * Copyright (C) 2025  Rakan AlShammari
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui";
import { Titlebar } from "./components/layout";
import { MobileBottomNav } from "./components/layout/mobile-bottom-nav";
import { isTauriEnvironment, useUpdateStore } from "./store/useUpdateStore";
import { useDbReady } from "./hooks/useDbReady";
import { useHostedTokenRefresh } from "./hooks/useHostedTokenRefresh";
import { useIsMobile } from "./hooks/useIsMobile";
import { useSyncBackground } from "./hooks/useSyncBackground";
import { useZoom } from "./hooks/useZoom";
import { useSettingsStore } from "./store/useSettingsStore";
import { UI_SCALE_MAX, UI_SCALE_MIN } from "./lib/appearance-limits";
import { Scaling } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { Trans } from "@lingui/react/macro";

export default function AppShell() {
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const installingUpdate = useUpdateStore(
    (state) => state.phase === "installing",
  );
  const hasRunRef = useRef(false);
  const { isReady: dbReady, error: dbError } = useDbReady();
  const { isMobilePlatform } = useIsMobile();
  const routerState = useRouterState();
  useHostedTokenRefresh(dbReady);
  useSyncBackground(dbReady);
  const uiScale = useSettingsStore((state) => state.uiScale);
  const setUiScale = useSettingsStore((state) => state.setUiScale);
  const { showIndicator: showScaleIndicator, isIndicatorVisible } = useZoom({
    zoom: uiScale,
    setZoom: setUiScale,
    wheel: false,
    step: 0.05,
    min: UI_SCALE_MIN,
    max: UI_SCALE_MAX,
  });

  const pathname = routerState.location.pathname;
  const isPlayRoute = pathname?.startsWith("/play");
  const isQuickstartRoute = pathname?.startsWith("/quickstart");
  const showMobileBottomNav =
    isMobilePlatform && !isPlayRoute && !isQuickstartRoute;

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    if (!isTauriEnvironment()) return;
    void checkForUpdates({ suppressUpToDateToast: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div
        className="flex h-screen flex-col overflow-hidden"
        style={
          isMobilePlatform
            ? { height: "100dvh", minHeight: "100svh" }
            : undefined
        }
      >
        <Titlebar />
        <div
          className={`min-h-0 flex-1 ${isPlayRoute ? "overflow-hidden" : "overflow-auto"} ${isMobilePlatform ? "" : "pt-8"}`}
          style={
            isMobilePlatform && !isPlayRoute
              ? {
                  paddingTop: "env(safe-area-inset-top)",
                  paddingBottom: showMobileBottomNav
                    ? "calc(3.5rem + env(safe-area-inset-bottom))"
                    : "env(safe-area-inset-bottom)",
                  paddingInlineStart: "env(safe-area-inset-left)",
                  paddingInlineEnd: "env(safe-area-inset-right)",
                }
              : undefined
          }
        >
          {!dbReady && !dbError && (
            <div className="flex h-full items-center justify-center">
              <div className="text-muted-foreground">Initializing...</div>
            </div>
          )}
          {dbError && (
            <div className="flex h-full items-center justify-center">
              <div className="text-destructive">Database error: {dbError}</div>
            </div>
          )}
          {dbReady && <Outlet />}
        </div>
        <MobileBottomNav />
        {showScaleIndicator && (
          <div
            role="status"
            className={`pointer-events-none fixed top-[calc(3rem+env(safe-area-inset-top))] end-4 z-[100] transition-opacity duration-[250ms] ${
              isIndicatorVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex items-center gap-2 rounded-xs border border-border bg-background/95 px-2 py-1 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm">
              <Scaling className="size-4" aria-hidden="true" />
              <span className="sr-only">
                <Trans>User interface scale</Trans>{" "}
              </span>
              {Math.round(uiScale * 100)}%
            </div>
          </div>
        )}
        <Toaster richColors expand position="top-right" />
        <AlertDialog open={installingUpdate}>
          <AlertDialogContent
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <AlertDialogTitle>
              <Trans>Installing update…</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                Saving your progress. Hakawati will restart when the update is
                ready.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ThemeProvider>
  );
}
