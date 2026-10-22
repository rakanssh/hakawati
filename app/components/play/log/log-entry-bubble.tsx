import {
  HandIcon,
  Loader2Icon,
  MegaphoneIcon,
  SpeechIcon,
  Volume2Icon,
} from "lucide-react";
import { LogEntry, LogEntryMode } from "@/types/log.type";
import { LogEntryError } from "./log-entry-error";
import { ActionBadge } from "./action-badge";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { StoryText } from "./story-text";

/** Player turns are boxed and marked with their voice; story-mode entries read like narration. */
const PLAYER_VOICES = {
  [LogEntryMode.SAY]: {
    name: "say",
    Icon: SpeechIcon,
    borderClass: "border-s-log-say/55",
    iconClass: "text-log-say",
  },
  [LogEntryMode.DO]: {
    name: "do",
    Icon: HandIcon,
    borderClass: "border-s-log-do/55",
    iconClass: "text-log-do",
  },
  [LogEntryMode.DIRECT]: {
    name: "direct",
    Icon: MegaphoneIcon,
    borderClass: "border-s-log-direct/55",
    iconClass: "text-log-direct",
  },
} as const;

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
  const { t } = useLingui();
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
          aria-label={t`Narrate section`}
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
  const errorReason = error !== undefined && <LogEntryError error={error} />;
  const body = content ?? <StoryText text={text} />;
  const actionIconClass = "me-2 mt-[0.3125em] inline h-[1em] w-[1em] shrink-0";
  const actionTextClass =
    "me-1 min-w-0 flex-1 whitespace-pre-wrap break-words font-normal leading-relaxed text-foreground/90";
  const logFontSizeStyle = {
    fontSize: "var(--game-log-font-size, 1rem)",
  };
  const footer =
    narration || (actions && actions.length > 0) ? (
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {narration && <NarrationButton {...narration} />}
        {actions?.map((action, idx) => (
          <ActionBadge key={`${action.type}-${idx}`} action={action} />
        ))}
      </div>
    ) : null;

  const voice =
    mode && mode in PLAYER_VOICES
      ? PLAYER_VOICES[mode as keyof typeof PLAYER_VOICES]
      : undefined;
  if (voice) {
    const { Icon, name, borderClass, iconClass } = voice;
    return (
      <div
        data-log-entry={name}
        className={cn(
          "rounded-xs border border-s-2 border-border/60 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm",
          borderClass,
        )}
      >
        <div className="flex items-start" style={logFontSizeStyle}>
          <Icon
            data-log-entry-icon=""
            className={cn(actionIconClass, iconClass)}
          />
          <div data-log-entry-text="" className={actionTextClass}>
            {body}
          </div>
        </div>
        {errorReason}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-start">
        <div
          data-log-story=""
          className="inline whitespace-pre-wrap break-words font-normal leading-[1.72] text-foreground/95"
          style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
        >
          {body}
        </div>
      </div>
      {errorReason}
      {footer}
    </div>
  );
}
