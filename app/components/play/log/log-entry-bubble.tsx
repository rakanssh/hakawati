import {
  HandIcon,
  Loader2Icon,
  MegaphoneIcon,
  SpeechIcon,
  Volume2Icon,
} from "lucide-react";
import { LogEntry, LogEntryMode } from "@/types/log.type";
import { ErrorTooltip } from "./error-tooltip";
import { ActionBadge } from "./action-badge";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

export interface LogEntryBubbleProps {
  entry: LogEntry;
  content?: ReactNode;
  narration?: {
    isLoading: boolean;
    isActive: boolean;
    onNarrate: () => void;
  };
}

function NarrationButton({
  isLoading,
  isActive,
  onNarrate,
}: NonNullable<LogEntryBubbleProps["narration"]>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "!h-7 !w-7 shrink-0 text-muted-foreground hover:text-foreground",
            isActive && "text-primary hover:text-primary",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onNarrate();
          }}
          disabled={isLoading}
          aria-label="Narrate section"
        >
          {isLoading ? (
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
  );
}

export function LogEntryBubble({
  entry,
  content,
  narration,
}: LogEntryBubbleProps) {
  const { text, mode, actions, error } = entry;
  const hasError = error !== undefined;
  const body = content ?? text;
  const footer =
    narration || (actions && actions.length > 0) ? (
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {narration && <NarrationButton {...narration} />}
        {actions?.map((action, idx) => (
          <ActionBadge key={`${action.type}-${idx}`} action={action} />
        ))}
      </div>
    ) : null;

  if (mode === LogEntryMode.SAY) {
    return (
      <div className="rounded-xs border border-l-2 border-border/60 border-l-log-say/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex items-start">
          <SpeechIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-say" />
          <p
            className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
            style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
          >
            {body}
          </p>
          {hasError && <ErrorTooltip error={error} />}
        </div>
        {footer}
      </div>
    );
  }

  if (mode === LogEntryMode.DO) {
    return (
      <div className="rounded-xs border border-l-2 border-border/60 border-l-log-do/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex items-start">
          <HandIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-do" />
          <p
            className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
            style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
          >
            {body}
          </p>
          {hasError && <ErrorTooltip error={error} />}
        </div>
        {footer}
      </div>
    );
  }

  if (mode === LogEntryMode.DIRECT) {
    return (
      <div className="rounded-xs border border-l-2 border-border/60 border-l-log-direct/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex items-start">
          <MegaphoneIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-direct" />
          <p
            className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
            style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
          >
            {body}
          </p>
          {hasError && <ErrorTooltip error={error} />}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-start">
        <p
          className="inline whitespace-pre-wrap break-words font-normal leading-[1.72] text-foreground/95"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
      {footer}
    </div>
  );
}
