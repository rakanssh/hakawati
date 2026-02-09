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
import { useIsMobile } from "./hooks/useIsMobile";

export default function AppShell() {
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const hasRunRef = useRef(false);
  const { isReady: dbReady, error: dbError } = useDbReady();
  const { isMobilePlatform } = useIsMobile();
  const routerState = useRouterState();

  const isPlayRoute = routerState.location.pathname?.startsWith("/play");
  const showMobileBottomNav = isMobilePlatform && !isPlayRoute;

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
        <Toaster richColors expand position="top-right" />
      </div>
    </ThemeProvider>
  );
}
