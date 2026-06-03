import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  SquareIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import { LogControl } from "@/components/play/log";
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

  const getModeIcon = () => {
    switch (action.type) {
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

  const getModeLabel = () => {
    switch (action.type) {
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

  const canStop = loading && !!onStop;
  const primaryHandler = canStop ? onStop : onSubmit;

  return (
    <div
      className={cn(
        "pointer-events-auto z-20 w-full border-t bg-accent",
        isMobilePlatform ? "px-2 pt-2" : "p-2",
      )}
      style={
        isMobilePlatform
          ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      {/* Mobile Collapsed State: Stacked Take a Turn + Log Controls */}
      {!isExpanded && (
        <div className="flex md:hidden flex-col gap-2 w-full">
          <LogControl
            handleContinue={onContinue}
            handleRetry={onRetry}
            handleStop={onStop}
            loading={loading}
            saving={saving}
            className="w-full"
          />
          <Button
            className="w-full !h-10"
            onClick={() => setIsExpanded(true)}
            disabled={loading}
            aria-label={t`Take a turn`}
          >
            <Trans>Take a Turn</Trans>
          </Button>
        </div>
      )}

      {/* Mobile Expanded State: Two Rows */}
      {isExpanded && (
        <div className="flex md:hidden flex-col gap-2 w-full">
          {/* Top Row: Back, Selector, Dice */}
          <div className="flex w-full items-center gap-1">
            <Button
              variant="outline"
              size="default"
              className="shrink-0 h-10"
              onClick={() => setIsExpanded(false)}
              aria-label={t`Go back`}
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <Trans>Back</Trans>
            </Button>

            <Select
              value={action.type}
              onValueChange={(value) =>
                setAction({
                  type: value as Action["type"],
                  isRolling: action.isRolling,
                })
              }
            >
              <SelectTrigger
                className="flex-1 rounded-xs !h-10"
                aria-label={t`Select action mode`}
              >
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {getModeIcon()}
                    <span>{getModeLabel()}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LogEntryMode.DO}>
                  <div className="flex items-center gap-2">
                    <HandIcon className="w-4 h-4" />
                    <span>
                      <Trans>Act</Trans>
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value={LogEntryMode.SAY}>
                  <div className="flex items-center gap-2">
                    <SpeechIcon className="w-4 h-4" />
                    <span>
                      <Trans>Say</Trans>
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value={LogEntryMode.STORY}>
                  <div className="flex items-center gap-2">
                    <BookIcon className="w-4 h-4" />
                    <span>
                      <Trans>Story</Trans>
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value={LogEntryMode.DIRECT}>
                  <div className="flex items-center gap-2">
                    <MegaphoneIcon className="w-4 h-4" />
                    <span>
                      <Trans>Direct</Trans>
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"outline"}
                  size="icon"
                  className={cn(
                    "shrink-0 !h-10 !w-10",
                    action.isRolling
                      ? "border-success/50 text-success hover:text-success"
                      : "text-muted-foreground hover:text-success",
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
          </div>

          {/* Bottom Row: Input + Send */}
          <div className="flex w-full items-end gap-1">
            <div className="relative flex-1 min-w-0">
              <div className="h-9" aria-hidden="true" />
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
                className="absolute inset-x-0 bottom-0 resize-none !bg-accent min-h-10"
                aria-label={t`Enter your action`}
              />
            </div>

            <Button
              type="submit"
              onClick={primaryHandler}
              disabled={canStop ? false : saving || loading}
              size="icon"
              className="w-10 h-10"
              aria-label={canStop ? t`Stop generating` : t`Submit action`}
            >
              {canStop ? (
                <SquareIcon className="w-4 h-4" />
              ) : saving ? (
                <SaveIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Desktop: Single Row with All Controls */}
      <div className="hidden md:flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"outline"}
              size="icon"
              className={cn(
                "shrink-0 h-10 w-10",
                action.isRolling
                  ? "border-success/50 text-success hover:text-success"
                  : "text-muted-foreground hover:text-success",
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

        <Select
          value={action.type}
          onValueChange={(value) =>
            setAction({
              type: value as Action["type"],
              isRolling: action.isRolling,
            })
          }
        >
          <SelectTrigger
            className="w-40 rounded-xs shrink-0 !h-10"
            aria-label={t`Select action mode`}
          >
            <SelectValue>
              <div className="flex items-center gap-2">
                {getModeIcon()}
                <span>{getModeLabel()}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LogEntryMode.DO}>
              <div className="flex items-center gap-2">
                <HandIcon className="w-4 h-4" />
                <span>
                  <Trans>Act</Trans>
                </span>
              </div>
            </SelectItem>
            <SelectItem value={LogEntryMode.SAY}>
              <div className="flex items-center gap-2">
                <SpeechIcon className="w-4 h-4" />
                <span>
                  <Trans>Say</Trans>
                </span>
              </div>
            </SelectItem>
            <SelectItem value={LogEntryMode.STORY}>
              <div className="flex items-center gap-2">
                <BookIcon className="w-4 h-4" />
                <span>
                  <Trans>Story</Trans>
                </span>
              </div>
            </SelectItem>
            <SelectItem value={LogEntryMode.DIRECT}>
              <div className="flex items-center gap-2">
                <MegaphoneIcon className="w-4 h-4" />
                <span>
                  <Trans>Direct</Trans>
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-0">
          <div className="h-9" aria-hidden="true" />
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
            className="absolute inset-x-0 bottom-0 resize-none !bg-accent min-h-10"
            aria-label={t`Enter your action`}
          />
        </div>

        <Button
          type="submit"
          onClick={primaryHandler}
          disabled={canStop ? false : saving || loading}
          className="shrink-0 h-10 w-10"
          aria-label={canStop ? t`Stop generating` : t`Submit action`}
        >
          {canStop ? (
            <SquareIcon className="w-4 h-4" />
          ) : saving ? (
            <SaveIcon className="w-4 h-4 animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
        </Button>

        <LogControl
          handleContinue={onContinue}
          handleRetry={onRetry}
          handleStop={onStop}
          loading={loading}
          saving={saving}
          className="shrink-0"
        />
      </div>
    </div>
  );
}
