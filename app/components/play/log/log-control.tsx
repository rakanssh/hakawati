import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UndoIcon,
  RedoIcon,
  RefreshCwIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  SquareIcon,
} from "lucide-react";
import { useTaleStore } from "@/store/useTaleStore";
import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface LogControlProps {
  className?: string;
  groupClassName?: string;
  buttonClassName?: string;
  handleRetry: () => void;
  handleStop?: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function LogControl({
  className,
  groupClassName,
  buttonClassName,
  loading = false,
  handleRetry,
  handleStop,
  saving = false,
}: LogControlProps) {
  const { t } = useLingui();
  const { undo, redo } = useTaleStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const hasOpenDialog = document.querySelector(
        '[role="dialog"], [aria-modal="true"]',
      );
      if (hasOpenDialog) return;

      if (e.key === "Escape" && loading && handleStop) {
        e.preventDefault();
        handleStop();
        return;
      }

      // Prevent keybinds from firing if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (!loading && !saving) {
          undo();
        }
      }

      if (
        (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        if (!loading && !saving) {
          redo();
        }
      }

      if (e.key === "r" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!loading && !saving) {
          handleRetry();
        }
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      globalThis.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [undo, redo, handleRetry, handleStop, loading, saving]);

  return (
    <div className={className}>
      <div className={cn("flex w-full flex-row gap-1", groupClassName)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("!h-10 !w-10 bg-card/70", buttonClassName)}
              onClick={handleRetry}
              disabled={loading || saving}
              aria-label={t`Retry`}
            >
              <RefreshCwIcon className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Retry (Ctrl+R)</Trans>
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn("!h-10 !w-10 bg-card/70", buttonClassName)}
                  disabled={loading || saving}
                  aria-label={t`History actions`}
                >
                  <HistoryIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <Trans>History</Trans>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" side="top" className="min-w-40">
            <DropdownMenuItem onClick={undo} disabled={loading || saving}>
              <UndoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
              <Trans>Undo</Trans>
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={redo} disabled={loading || saving}>
              <RedoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
              <Trans>Redo</Trans>
              <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface ContinueControlProps {
  onContinue: () => void;
  onStop?: () => void;
  loading?: boolean;
  saving?: boolean;
  className?: string;
  showLabel?: boolean;
}

export function ContinueControl({
  onContinue,
  onStop,
  loading = false,
  saving = false,
  className,
  showLabel = false,
}: ContinueControlProps) {
  const { t } = useLingui();
  const canStop = loading && !!onStop;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          onClick={canStop ? onStop : onContinue}
          disabled={canStop ? false : saving || loading}
          variant="outline"
          size={showLabel ? "default" : "icon"}
          className={className}
          aria-label={canStop ? t`Stop generating` : t`Continue`}
        >
          {canStop ? (
            <SquareIcon className="h-4 w-4" />
          ) : (
            <MoreHorizontalIcon className="h-4 w-4" />
          )}
          {showLabel && (
            <span>
              {canStop ? <Trans>Stop</Trans> : <Trans>Continue</Trans>}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {canStop ? (
          <Trans>Stop generating (Esc)</Trans>
        ) : (
          <Trans>Continue</Trans>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
