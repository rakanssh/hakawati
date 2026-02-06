import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SlidersHorizontalIcon,
  Trash2,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSettingsStore, useDebugConsoleStore } from "@/store";
import { DebugLogValueView } from "./debug-log-value-view";
import type { DebugConsoleLevel } from "@/store";

const DEFAULT_PANEL_HEIGHT = 224;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT_RATIO = 0.8;
const LEVELS: readonly DebugConsoleLevel[] = [
  "debug",
  "info",
  "log",
  "warn",
  "error",
];
const DEFAULT_VISIBLE_LEVELS: Record<DebugConsoleLevel, boolean> = {
  debug: true,
  info: true,
  log: true,
  warn: true,
  error: true,
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function DebugConsoleDock() {
  const { t } = useLingui();
  const debugConsoleEnabled = useSettingsStore(
    (state) => state.debugConsoleEnabled,
  );
  const entries = useDebugConsoleStore((state) => state.entries);
  const isOpen = useDebugConsoleStore((state) => state.isOpen);
  const setOpen = useDebugConsoleStore((state) => state.setOpen);
  const toggleOpen = useDebugConsoleStore((state) => state.toggleOpen);
  const clearEntries = useDebugConsoleStore((state) => state.clearEntries);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [visibleLevels, setVisibleLevels] = useState<
    Record<DebugConsoleLevel, boolean>
  >(DEFAULT_VISIBLE_LEVELS);
  const [levelsMenuOpen, setLevelsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!visibleLevels[entry.level]) return false;
        if (!normalizedSearchQuery) return true;
        const searchableText =
          entry.searchText ?? `${entry.level} ${entry.message}`.toLowerCase();
        return searchableText.includes(normalizedSearchQuery);
      }),
    [entries, visibleLevels, normalizedSearchQuery],
  );
  const visibleLevelCount = useMemo(
    () => LEVELS.filter((level) => visibleLevels[level]).length,
    [visibleLevels],
  );

  useEffect(() => {
    if (!debugConsoleEnabled) setOpen(false);
  }, [debugConsoleEnabled, setOpen]);

  useEffect(() => {
    const handleResize = () => {
      const maxHeight = Math.floor(window.innerHeight * MAX_PANEL_HEIGHT_RATIO);
      setPanelHeight((current) =>
        Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, current)),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const beginResize = (startY: number) => {
    const startHeight = panelHeight;
    const maxHeight = Math.floor(window.innerHeight * MAX_PANEL_HEIGHT_RATIO);

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";

    const onMove = (clientY: number) => {
      const delta = startY - clientY;
      const nextHeight = startHeight + delta;
      setPanelHeight(
        Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, nextHeight)),
      );
    };

    const onMouseMove = (event: MouseEvent) => onMove(event.clientY);
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      onMove(touch.clientY);
    };
    const stop = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
      window.removeEventListener("touchcancel", stop);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", stop);
    window.addEventListener("touchcancel", stop);
  };

  if (!debugConsoleEnabled) return null;

  return (
    <div className="relative z-10 shrink-0 border-t bg-background">
      {isOpen && (
        <div
          className="relative z-10 flex flex-col overflow-hidden border-b bg-background"
          style={{ height: panelHeight }}
        >
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize debug console"
            className="group flex h-2 cursor-ns-resize items-center justify-center border-b"
            onMouseDown={(event) => beginResize(event.clientY)}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) beginResize(touch.clientY);
            }}
          >
            <div className="bg-muted-foreground/40 group-hover:bg-muted-foreground/70 h-0.5 w-10 rounded-full transition-colors" />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {entries.length === 0 ? (
                <div className="text-muted-foreground font-mono text-xs">
                  <Trans>No debug logs yet.</Trans>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="text-muted-foreground font-mono text-xs">
                  {normalizedSearchQuery ? (
                    <Trans>No logs match your search.</Trans>
                  ) : (
                    <Trans>No logs for selected levels.</Trans>
                  )}
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 font-mono text-xs"
                  >
                    <span className="text-muted-foreground shrink-0">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <span
                      className={cn("shrink-0 uppercase", {
                        "text-slate-500": entry.level === "debug",
                        "text-blue-600": entry.level === "info",
                        "text-emerald-600": entry.level === "log",
                        "text-amber-600": entry.level === "warn",
                        "text-rose-600": entry.level === "error",
                      })}
                    >
                      {entry.level}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {entry.values.length > 0 ? (
                        entry.values.map((value, index) => (
                          <div
                            key={index}
                            className="whitespace-pre-wrap break-words"
                          >
                            <DebugLogValueView value={value} />
                          </div>
                        ))
                      ) : (
                        <span className="text-foreground">&lt;empty&gt;</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex h-8 items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleOpen}
            className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-foreground hover:text-primary"
          >
            {isOpen ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronUpIcon className="h-3.5 w-3.5" />
            )}
            <span>
              <Trans>Debug Console</Trans> ({filteredEntries.length}/
              {entries.length})
            </span>
          </button>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t`Search logs...`}
            className="h-6 w-32 rounded-xs px-2 font-mono text-xs md:w-48"
          />
        </div>
        <div className="flex items-center gap-1">
          <Popover open={levelsMenuOpen} onOpenChange={setLevelsMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1.5 px-2 text-xs"
              >
                <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                <Trans>Levels</Trans>
                <span className="text-muted-foreground">
                  {visibleLevelCount}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end" side="top">
              <Command>
                <CommandInput placeholder={t`Search levels...`} />
                <CommandList>
                  <CommandEmpty>
                    <Trans>No matching levels.</Trans>
                  </CommandEmpty>
                  <CommandGroup heading={t`Levels`}>
                    {LEVELS.map((level) => (
                      <CommandItem
                        key={level}
                        onSelect={() =>
                          setVisibleLevels((state) => ({
                            ...state,
                            [level]: !state[level],
                          }))
                        }
                        className="font-mono uppercase"
                      >
                        <CheckIcon
                          className={cn(
                            "me-2 h-4 w-4",
                            visibleLevels[level] ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {level}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => clearEntries()}
            className="shrink-0 h-8 w-8 hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
