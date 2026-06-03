import { HandIcon, MegaphoneIcon, SpeechIcon } from "lucide-react";
import { LogEntry, LogEntryMode } from "@/types/log.type";
import { ErrorTooltip } from "./error-tooltip";
import { ActionBadge } from "./action-badge";
import type { ReactNode } from "react";

export interface LogEntryBubbleProps {
  entry: LogEntry;
  content?: ReactNode;
}

export function LogEntryBubble({ entry, content }: LogEntryBubbleProps) {
  const { text, mode, actions, error } = entry;
  const hasError = error !== undefined;
  const body = content ?? text;

  if (mode === LogEntryMode.SAY) {
    return (
      <div className="flex items-start rounded-xs border border-l-2 border-border/60 border-l-log-say/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <SpeechIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-say" />
        <p
          className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  if (mode === LogEntryMode.DO) {
    return (
      <div className="flex items-start rounded-xs border border-l-2 border-border/60 border-l-log-do/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <HandIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-do" />
        <p
          className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  if (mode === LogEntryMode.DIRECT) {
    return (
      <div className="flex items-start rounded-xs border border-l-2 border-border/60 border-l-log-direct/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm">
        <MegaphoneIcon className="me-2 mt-1 inline h-4 w-4 shrink-0 text-log-direct" />
        <p
          className="me-1 inline whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      {actions && actions.length > 0 && (
        <div className="flex flex-row mb-2">
          {actions.map((action, idx) => (
            <ActionBadge key={`${action.type}-${idx}`} action={action} />
          ))}
        </div>
      )}
      <div className="flex items-start">
        <p
          className="inline whitespace-pre-wrap break-words font-normal leading-[1.72] text-foreground/95"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    </div>
  );
}
