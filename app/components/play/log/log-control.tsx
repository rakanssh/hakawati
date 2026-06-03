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
  MoreHorizontalIcon,
  SquareIcon,
} from "lucide-react";
import { useTaleStore } from "@/store/useTaleStore";
import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

interface LogControlProps {
  className?: string;
  handleRetry: () => void;
  handleStop?: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function LogControl({
  className,
  loading = false,
  handleRetry,
  handleStop,
  saving = false,
}: LogControlProps) {
  const { t } = useLingui();
  const { undo, redo } = useTaleStore();
  const commandButtonClass =
    "composer-command-button !h-10 !w-auto min-w-10 flex-1 border-transparent bg-transparent px-3 shadow-none hover:border-border hover:bg-muted/45";

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
    <div className={cn("min-w-0 flex-[3_1_0]", className)}>
      <div className="flex w-full flex-row gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("bg-card/70", commandButtonClass)}
              onClick={handleRetry}
              disabled={loading || saving}
              aria-label={t`Retry`}
            >
              <RefreshCwIcon className="h-4 w-4" strokeWidth={1.5} />
              <span className="composer-command-label">
                <Trans>Retry</Trans>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Retry (Ctrl+R)</Trans>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("bg-card/70", commandButtonClass)}
              onClick={undo}
              disabled={loading || saving}
              aria-label={t`Undo`}
            >
              <UndoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
              <span className="composer-command-label">
                <Trans>Undo</Trans>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Undo (Ctrl+Z)</Trans>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("bg-card/70", commandButtonClass)}
              onClick={redo}
              disabled={loading || saving}
              aria-label={t`Redo`}
            >
              <RedoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
              <span className="composer-command-label">
                <Trans>Redo</Trans>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Redo (Ctrl+Y)</Trans>
          </TooltipContent>
        </Tooltip>
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
}

export function ContinueControl({
  onContinue,
  onStop,
  loading = false,
  saving = false,
  className,
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
          size="default"
          className={className}
          aria-label={canStop ? t`Stop generating` : t`Continue`}
        >
          {canStop ? (
            <SquareIcon className="h-4 w-4" />
          ) : (
            <MoreHorizontalIcon className="h-4 w-4" />
          )}
          <span className="composer-command-label">
            {canStop ? <Trans>Stop</Trans> : <Trans>Continue</Trans>}
          </span>
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
