import { MinusIcon, SquareIcon, XIcon, ArrowLeftIcon } from "lucide-react";
import { SettingsButton } from "./settings-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";

export function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-8 bg-background border-b"
    >
      <div className="grid grid-cols-3 items-center h-full px-2 select-none">
        <div />
        <div className="p-0 m-0 absolute left-0 ">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {}}
                className="flex-1 w-10 h-10"
              >
                <ArrowLeftIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Home</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <SettingsButton className="flex-1 w-10 h-10" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex justify-center">
          <span className="text-sm font-medium tracking-wide text-foreground">
            Hakawati
          </span>
        </div>
        <div className="titlebar-no-drag flex justify-end gap-0">
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
