import { MinusIcon, SquareIcon, XIcon } from "lucide-react";

export function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-8 bg-background border-b"
    >
      <div className="grid grid-cols-3 items-center h-full px-2 select-none">
        <div />
        <div className="flex justify-center">
          <span className="text-sm font-medium tracking-wide text-foreground">
            Hakawati
          </span>
        </div>
        <div className="titlebar-no-drag flex justify-end gap-1">
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
            <SquareIcon className="w-4 h-4" />
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
