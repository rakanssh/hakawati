import { HomeIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { SettingsButton } from "./settings-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { useNavigate } from "react-router";
import fez from "@/assets/fez-offwh.svg";

export function Titlebar() {
  const navigate = useNavigate();
  const isClient = typeof window !== "undefined";
  const isDemo = isClient && window.location.pathname.split("/")[1] === "demo";
  return (
    <div
      data-tauri-drag-region
      className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-8 bg-background border-b"
    >
      <div className="grid grid-cols-3 items-center h-full px-2 select-none pointer-events-none">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <img src={fez} alt="Hakawati" className="w-6 h-6 " />
          </Button>

          {isDemo && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="titlebar-no-drag pointer-events-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate("/")}
                    >
                      <HomeIcon className="" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Home</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="titlebar-no-drag pointer-events-auto">
                    <SettingsButton className="" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Settings</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
        <div className="flex justify-center">
          <span className="text-sm font-medium tracking-wide text-foreground">
            Hakawati
          </span>
        </div>
        <div className="titlebar-no-drag pointer-events-auto flex justify-end gap-1 w-fit absolute right-0">
          <button
            aria-label="Minimize"
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-foreground/10 text-foreground/80 hover:text-foreground"
            onClick={async () => {
              if (typeof window === "undefined") return;
              const { getCurrentWebviewWindow } = await import(
                "@tauri-apps/api/webviewWindow"
              );
              await getCurrentWebviewWindow().minimize();
            }}
          >
            <MinusIcon className="w-4 h-4" />
          </button>
          <button
            aria-label="Maximize"
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-foreground/10 text-foreground/80 hover:text-foreground"
            onClick={async () => {
              if (typeof window === "undefined") return;
              const { getCurrentWebviewWindow } = await import(
                "@tauri-apps/api/webviewWindow"
              );
              const appWindow = getCurrentWebviewWindow();
              const isMax = await appWindow.isMaximized();
              if (isMax) {
                await appWindow.unmaximize();
              } else {
                await appWindow.maximize();
              }
            }}
          >
            <SquareIcon className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-foreground/10 text-foreground/80 hover:text-foreground"
            onClick={async () => {
              if (typeof window === "undefined") return;
              const { getCurrentWebviewWindow } = await import(
                "@tauri-apps/api/webviewWindow"
              );
              await getCurrentWebviewWindow().close();
            }}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
