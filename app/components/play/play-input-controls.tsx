import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DicesIcon,
  HandIcon,
  SendIcon,
  SpeechIcon,
  BookIcon,
  MegaphoneIcon,
  SaveIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  CheckIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import { ContinueControl, LogControl } from "@/components/play/log";
import { getPlaceholderMessage, Action } from "@/lib/play-utils";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Trans, useLingui } from "@lingui/react/macro";

interface PlayInputControlsProps {
  action: Action;
  setAction: (action: Action) => void;
  input: string;
  setInput: (input: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  loading: boolean;
  saving: boolean;
  onContinue: () => void;
  onRetry: () => void;
}

const ACTION_MODES = [
  LogEntryMode.DO,
  LogEntryMode.SAY,
  LogEntryMode.STORY,
  LogEntryMode.DIRECT,
] as const;

export function PlayInputControls({
  action,
  setAction,
  input,
  setInput,
  onSubmit,
  onStop,
  loading,
  saving,
  onContinue,
  onRetry,
}: PlayInputControlsProps) {
  const { t } = useLingui();
  const { isMobileViewport, isMobilePlatform } = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(!isMobileViewport);

  useEffect(() => {
    setIsExpanded(!isMobileViewport);
  }, [isMobileViewport]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded && isMobileViewport) {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, isMobileViewport]);

  const getModeIcon = (mode: Action["type"] = action.type) => {
    switch (mode) {
      case LogEntryMode.DO:
        return <HandIcon className="w-4 h-4" />;
      case LogEntryMode.SAY:
        return <SpeechIcon className="w-4 h-4" />;
      case LogEntryMode.STORY:
        return <BookIcon className="w-4 h-4" />;
      case LogEntryMode.DIRECT:
        return <MegaphoneIcon className="w-4 h-4" />;
      default:
        return <HandIcon className="w-4 h-4" />;
    }
  };

  const getModeLabel = (mode: Action["type"] = action.type) => {
    switch (mode) {
      case LogEntryMode.DO:
        return t`Act`;
      case LogEntryMode.SAY:
        return t`Say`;
      case LogEntryMode.STORY:
        return t`Story`;
      case LogEntryMode.DIRECT:
        return t`Direct`;
      default:
        return t`Act`;
    }
  };

  const renderModeMenu = ({
    className,
    compact = false,
  }: {
    className?: string;
    compact?: boolean;
  } = {}) => (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "!h-10 shrink-0 rounded-xs border border-border/70 bg-muted/25 px-3 text-foreground shadow-none hover:bg-muted/45",
                compact ? "!w-12 px-0" : "min-w-24 justify-between",
                className,
              )}
              aria-label={t`Select action mode`}
              title={getModeLabel()}
            >
              <span className="flex items-center gap-2">
                {getModeIcon()}
                {!compact && <span>{getModeLabel()}</span>}
              </span>
              {!compact && (
                <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{getModeLabel()}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="min-w-36">
        {ACTION_MODES.map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={() =>
              setAction({
                type: mode,
                isRolling: action.isRolling,
              })
            }
            className={cn(
              action.type === mode && "bg-accent text-accent-foreground",
            )}
          >
            {getModeIcon(mode)}
            <span>{getModeLabel(mode)}</span>
            {action.type === mode && <CheckIcon className="ms-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderDiceToggle = (className?: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "!h-9 !w-9 shrink-0 border shadow-none",
            action.isRolling
              ? "border-success/45 bg-success/10 text-success hover:bg-success/15 hover:text-success"
              : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/45 hover:text-foreground",
            className,
          )}
          onClick={() =>
            setAction({
              type: action.type,
              isRolling: !action.isRolling,
            })
          }
          disabled={loading}
          aria-label={t`Roll a dice`}
        >
          <DicesIcon strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Roll a dice</Trans>
      </TooltipContent>
    </Tooltip>
  );

  const renderTextArea = () => (
    <Textarea
      placeholder={t(getPlaceholderMessage(action))}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (loading || saving) return;
          onSubmit();
        }
      }}
      rows={1}
      className="max-h-[300px] min-h-12 flex-1 resize-none border-0 !bg-transparent px-3 py-3 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent"
      aria-label={t`Enter your action`}
    />
  );

  const renderSubmitButton = (className?: string) => (
    <Button
      type="submit"
      onClick={onSubmit}
      disabled={saving || loading}
      size="icon"
      className={cn("!h-9 !w-9 shrink-0", className)}
      aria-label={t`Submit action`}
    >
      {saving ? (
        <SaveIcon className="w-4 h-4 animate-spin" />
      ) : (
        <SendIcon className="w-4 h-4" />
      )}
    </Button>
  );

  const renderComposer = (compactMode = false) => (
    <div className="flex min-h-12 min-w-0 flex-1 items-end overflow-hidden rounded-xs border border-border/75 bg-card/85 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18">
      <div className="flex min-h-12 shrink-0 items-end border-e border-border/70 bg-muted/20 p-1">
        {renderModeMenu({ compact: compactMode })}
      </div>
      {renderTextArea()}
      <div className="flex min-h-12 shrink-0 items-end gap-1 border-s border-border/70 bg-background/35 p-1">
        {renderDiceToggle()}
        {renderSubmitButton()}
      </div>
    </div>
  );

  const commandButtonClass =
    "!h-10 !w-10 border-transparent bg-transparent shadow-none hover:border-border hover:bg-muted/45";

  const renderCommandCluster = ({
    showContinueLabel = false,
  }: {
    showContinueLabel?: boolean;
  } = {}) => (
    <div className="flex h-12 shrink-0 items-center gap-1 rounded-xs border border-border/70 bg-card/60 p-1 shadow-xs">
      <ContinueControl
        onContinue={onContinue}
        onStop={onStop}
        loading={loading}
        saving={saving}
        showLabel={showContinueLabel}
        className={cn(
          "bg-background/60 shadow-none hover:bg-muted/55",
          showContinueLabel ? "!h-10 px-3" : "!h-10 !w-10",
        )}
      />
      <LogControl
        handleRetry={onRetry}
        handleStop={onStop}
        loading={loading}
        saving={saving}
        className="shrink-0"
        groupClassName="gap-1"
        buttonClassName={commandButtonClass}
      />
    </div>
  );

  return (
    <div
      className={cn(
        "pointer-events-auto z-20 w-full border-t bg-background/80 shadow-[0_-12px_32px_color-mix(in_oklch,var(--background)_55%,transparent)] backdrop-blur-xl",
        isMobilePlatform ? "px-2 pt-2" : "p-3",
      )}
      style={
        isMobilePlatform
          ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      {/* Mobile Collapsed State: One-line turn button plus commands */}
      {!isExpanded && (
        <div className="flex md:hidden w-full items-end gap-1">
          <Button
            className="!h-10 min-w-0 flex-1"
            onClick={() => setIsExpanded(true)}
            disabled={loading}
            aria-label={t`Take a turn`}
          >
            <Trans>Take a Turn</Trans>
          </Button>
          {renderCommandCluster()}
        </div>
      )}

      {/* Mobile Expanded State: Two Rows */}
      {isExpanded && (
        <div className="flex md:hidden flex-col gap-2 w-full">
          {/* Top Row: Back */}
          <div className="flex w-full items-center gap-1">
            <Button
              variant="outline"
              size="default"
              className="!h-10 shrink-0 bg-card/70"
              onClick={() => setIsExpanded(false)}
              aria-label={t`Go back`}
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <Trans>Back</Trans>
            </Button>
            <div className="min-w-0 flex-1" />
            {renderCommandCluster()}
          </div>

          {renderComposer(true)}
        </div>
      )}

      {/* Desktop: Single-row composer */}
      <div className="hidden md:flex items-end gap-2">
        {renderComposer(false)}
        {renderCommandCluster({ showContinueLabel: true })}
      </div>
    </div>
  );
}
