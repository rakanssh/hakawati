import { LogEntry } from "@/types/log.type";
import { ReactNode, Fragment, useEffect, useRef, useState } from "react";
import { LLMAction } from "@/services/llm/schema";
import { ErrorTooltip } from "./error-tooltip";
import { ActionBadge } from "./action-badge";
import { LogBlock } from "@/lib/play-utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  Loader2Icon,
  Volume2Icon,
} from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { useSettingsStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LogBlockBubbleProps {
  block: LogBlock;
  isStreaming?: boolean;
  onEditStart?: (entryId: string) => void;
  renderEntry?: (entry: LogEntry, onClick: () => void) => ReactNode;
  narration?: {
    isLoading: boolean;
    isActive: boolean;
    onNarrate: () => void;
  };
}

export function LogBlockBubble({
  block,
  isStreaming,
  onEditStart,
  renderEntry,
  narration,
}: LogBlockBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const thinkingVisibility = useSettingsStore(
    (state) => state.thinkingVisibility,
  );
  const prevStreamingTextLengthRef = useRef(0);

  const actions: LLMAction[] = block.entries.flatMap((e) => e.actions || []);
  const hasError = block.entries.some((e) => e.error !== undefined);
  const errorEntry = block.entries.find((e) => e.error !== undefined);
  const thinkingEntries = block.entries
    .map((entry, entryIndex) => ({
      id: entry.id,
      text: entry.thinking?.trim() ?? "",
      chainIndex: entryIndex,
    }))
    .filter((entry) => entry.text.length > 0);
  const visibleThinkingEntries =
    thinkingVisibility === "latest"
      ? thinkingEntries.slice(-1)
      : thinkingEntries;
  const showThinkingSection =
    thinkingVisibility !== "none" && visibleThinkingEntries.length > 0;
  const showThinkingCountBadge =
    thinkingVisibility === "all" && thinkingEntries.length > 1;
  const showThinkingLabels =
    thinkingVisibility === "all"
      ? visibleThinkingEntries.length > 1
      : thinkingEntries.length > 1;
  const latestStreamingEntry = block.entries.at(-1);
  const footerControls = (
    <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-1.5">
      {narration && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "!h-7 !w-7 shrink-0 text-muted-foreground hover:text-foreground",
                narration.isActive && "text-primary hover:text-primary",
              )}
              onClick={narration.onNarrate}
              disabled={narration.isLoading}
              aria-label="Narrate section"
            >
              {narration.isLoading ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2Icon className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Narrate section</Trans>
          </TooltipContent>
        </Tooltip>
      )}
      {showThinkingSection && (
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle thinking output"
          >
            <BrainCircuitIcon className="h-3.5 w-3.5" />
            <span>
              <Trans>Thinking</Trans>
            </span>
            {showThinkingCountBadge && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] leading-none text-foreground">
                {thinkingEntries.length}
              </span>
            )}
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${
                thinkingOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
      )}
      {actions.length > 0 && (
        <div className="flex flex-row flex-wrap gap-y-1">
          {actions.map((action, idx) => (
            <ActionBadge key={`${action.type}-${idx}`} action={action} />
          ))}
        </div>
      )}
    </div>
  );

  useEffect(() => {
    if (!isStreaming) {
      prevStreamingTextLengthRef.current = 0;
      return;
    }

    const nextLength = latestStreamingEntry?.text.length ?? 0;
    const prevLength = prevStreamingTextLengthRef.current;
    if (prevLength === 0 && nextLength > 0) {
      setThinkingOpen(false);
    }
    prevStreamingTextLengthRef.current = nextLength;
  }, [isStreaming, latestStreamingEntry?.text]);

  return (
    <div className="flex w-full flex-col items-start">
      <div
        className="w-full whitespace-pre-wrap break-words font-normal leading-[1.72] tracking-normal text-foreground/95"
        style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
      >
        {block.entries.map((e) => {
          const onClick = () => onEditStart?.(e.id);
          if (renderEntry) {
            return <Fragment key={e.id}>{renderEntry(e, onClick)}</Fragment>;
          }
          return (
            <span key={e.id} className="cursor-pointer" onClick={onClick}>
              {e.text}
            </span>
          );
        })}
        {hasError && errorEntry && <ErrorTooltip error={errorEntry.error} />}
        {isStreaming && (
          <span className="inline-block w-0.5 h-[1.1em] bg-primary/70 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
      {showThinkingSection ? (
        <Collapsible
          open={thinkingOpen}
          onOpenChange={setThinkingOpen}
          className="mt-2 w-full max-w-full"
        >
          {footerControls}
          <CollapsibleContent className="mt-2 flex w-full flex-col rounded-xs border border-border/60 bg-card/60 p-2.5 shadow-sm backdrop-blur-sm">
            {visibleThinkingEntries.map((entry, index) => (
              <Fragment key={entry.id}>
                <div className="rounded-xs border border-border/60 bg-background/50 p-2.5">
                  {showThinkingLabels && (
                    <div className="mb-1 flex items-center">
                      <span className="inline-flex items-center rounded-xs border border-log-thinking/25 bg-log-thinking/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-log-thinking-foreground">
                        {entry.chainIndex === 0 ? (
                          <Trans>Initial</Trans>
                        ) : (
                          <Trans>Continuation {entry.chainIndex}</Trans>
                        )}
                      </span>
                    </div>
                  )}
                  <p
                    className="whitespace-pre-wrap text-muted-foreground"
                    style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
                  >
                    {entry.text}
                  </p>
                </div>
                {index < visibleThinkingEntries.length - 1 && (
                  <div className="my-2 border-t border-dashed border-muted-foreground/40" />
                )}
              </Fragment>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        (narration || actions.length > 0) && footerControls
      )}
    </div>
  );
}

export default LogBlockBubble;
