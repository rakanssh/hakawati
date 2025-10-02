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
