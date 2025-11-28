import { HandIcon, MegaphoneIcon, SpeechIcon } from "lucide-react";
import { LogEntry, LogEntryMode } from "@/types/log.type";
import { ErrorTooltip } from "./error-tooltip";
import { ActionBadge } from "./action-badge";

export interface LogEntryBubbleProps {
  entry: LogEntry;
}

export function LogEntryBubble({ entry }: LogEntryBubbleProps) {
  const { text, mode, actions, error } = entry;
  const hasError = error !== undefined;

  if (mode === LogEntryMode.SAY) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-blue-300/15">
        <SpeechIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p
          className="inline whitespace-pre-wrap break-words mr-1"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {text}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  if (mode === LogEntryMode.DO) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-amber-300/15">
        <HandIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p
          className="inline whitespace-pre-wrap break-words mr-1"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {text}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  if (mode === LogEntryMode.DIRECT) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-green-300/15">
        <MegaphoneIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p
          className="inline whitespace-pre-wrap break-words mr-1"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {text}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start ml-2">
      {actions && actions.length > 0 && (
        <div className="flex flex-row mb-2">
          {actions.map((action, idx) => (
            <ActionBadge key={`${action.type}-${idx}`} action={action} />
          ))}
        </div>
      )}
      <div className="flex items-start">
        <p
          className="inline whitespace-pre-wrap break-words"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {text}
        </p>
        {hasError && <ErrorTooltip error={error} />}
      </div>
    </div>
  );
}
