import { Outlet } from "@tanstack/react-router";

import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui";
import { Titlebar } from "./components/layout";

export default function AppShell() {
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
