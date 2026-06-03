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
  ChevronUpIcon,
  CheckIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import { ContinueControl, LogControl } from "@/components/play/log";
import { getPlaceholderMessage, Action } from "@/lib/play-utils";
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
  const { isMobilePlatform } = useIsMobile();

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
  }: {
    className?: string;
  } = {}) => (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "composer-command-button !h-10 !w-auto min-w-10 rounded-xs border border-input bg-background/75 px-3 text-foreground shadow-xs hover:border-ring/45 hover:bg-background",
                className,
              )}
              aria-label={t`Select action mode`}
              title={getModeLabel()}
            >
              <span className="flex items-center gap-2">
                {getModeIcon()}
                <span className="composer-command-label">{getModeLabel()}</span>
              </span>
              <span className="composer-command-select-affordance ms-auto flex items-center border-s border-border/70 ps-2 text-muted-foreground">
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </span>
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
      className="max-h-[300px] min-h-12 resize-none border-0 !bg-transparent ps-3 pe-24 py-3 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent"
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

  const renderComposer = () => (
    <div className="relative min-h-12 min-w-0 flex-1 overflow-hidden rounded-xs border border-border/75 bg-card/85 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18">
      {renderTextArea()}
      <div className="absolute bottom-1.5 end-1.5 flex items-center gap-1">
        {renderDiceToggle()}
        {renderSubmitButton()}
      </div>
    </div>
  );

  const commandButtonClass =
    "composer-command-button !h-10 !w-auto min-w-10 flex-1 border-transparent bg-transparent px-3 shadow-none hover:border-border hover:bg-muted/45";

  const renderCommandCluster = (className?: string) => (
    <div
      className={cn(
        "composer-command-tier flex min-w-0 items-center gap-1 rounded-xs border border-border/70 bg-card/60 p-1 shadow-xs",
        className,
      )}
    >
      {renderModeMenu({ className: "flex-1 bg-background/45" })}
      <ContinueControl
        onContinue={onContinue}
        onStop={onStop}
        loading={loading}
        saving={saving}
        showLabel
        className="composer-command-button !h-10 !w-auto min-w-10 flex-1 bg-background/60 px-3 shadow-none hover:bg-muted/55"
      />
      <LogControl
        handleRetry={onRetry}
        handleStop={onStop}
        loading={loading}
        saving={saving}
        className="min-w-0 flex-[3_1_0]"
        groupClassName="gap-1"
        buttonClassName={commandButtonClass}
        showLabels
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
      <div className="flex w-full flex-col gap-2">
        {renderCommandCluster("w-full")}
        {renderComposer()}
      </div>
    </div>
  );
}
