import { LogEntry } from "@/types/log.type";
import { ReactNode, Fragment } from "react";
import { LLMAction } from "@/services/llm/schema";
import { ErrorTooltip } from "./error-tooltip";
import { ActionBadge } from "./action-badge";
import { LogBlock } from "@/lib/play-utils";

interface LogBlockBubbleProps {
  block: LogBlock;
  isStreaming?: boolean;
  onEditStart?: (entryId: string) => void;
  renderEntry?: (entry: LogEntry, onClick: () => void) => ReactNode;
}

export function LogBlockBubble({
  block,
  isStreaming,
  onEditStart,
  renderEntry,
}: LogBlockBubbleProps) {
  const actions: LLMAction[] = block.entries.flatMap((e) => e.actions || []);
  const hasError = block.entries.some((e) => e.error !== undefined);
  const errorEntry = block.entries.find((e) => e.error !== undefined);

  return (
    <div className="flex flex-col items-start ml-2">
      <div
        className="inline whitespace-pre-wrap break-words"
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
      <div className="flex flex-row mt-2">
        {actions.length > 0 && (
          <div className="flex flex-row flex-wrap gap-y-1">
            {actions.map((action, idx) => (
              <ActionBadge key={`${action.type}-${idx}`} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LogBlockBubble;
