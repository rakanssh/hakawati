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

import { Outlet } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui";
import { Titlebar } from "./components/layout";
import { isTauriEnvironment, useUpdateStore } from "./store/useUpdateStore";

export default function AppShell() {
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    if (!isTauriEnvironment()) return;
    void checkForUpdates({ suppressUpToDateToast: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Titlebar />
      <div className="pt-8">
        <Outlet />
      </div>
      <Toaster richColors expand />
    </ThemeProvider>
  );
}
