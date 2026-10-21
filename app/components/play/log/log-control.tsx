import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UndoIcon, RedoIcon, RefreshCwIcon } from "lucide-react";
import { useTaleStore } from "@/store/useTaleStore";
import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

interface LogControlShortcutProps {
  handleUndo?: () => void;
  handleRedo?: () => void;
  handleRetry: () => void;
  handleStop?: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function useLogControlShortcuts({
  loading = false,
  handleUndo,
  handleRedo,
  handleRetry,
  handleStop,
  saving = false,
}: LogControlShortcutProps) {
  const { undo, redo } = useTaleStore();
  const effectiveUndo = handleUndo ?? undo;
  const effectiveRedo = handleRedo ?? redo;

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
          effectiveUndo();
        }
      }

      if (
        (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        if (!loading && !saving) {
          effectiveRedo();
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
  }, [effectiveUndo, effectiveRedo, handleRetry, handleStop, loading, saving]);
}

// The composer sizes these, larger on phones than on desktop.
const historyButtonClass =
  "shrink-0 gap-2 border border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-muted/45 hover:text-foreground";

interface RetryControlProps {
  className?: string;
  handleRetry: () => void;
  loading?: boolean;
  saving?: boolean;
  /** Names the action beside its icon; hidden again in a narrow composer. */
  showLabel?: boolean;
}

export function RetryControl({
  className,
  handleRetry,
  loading = false,
  saving = false,
  showLabel = false,
}: RetryControlProps) {
  const { t } = useLingui();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={cn(historyButtonClass, className)}
          onClick={handleRetry}
          disabled={loading || saving}
          aria-label={t`Retry`}
        >
          <RefreshCwIcon className="size-5" strokeWidth={1.5} />
          {showLabel && (
            <span className="composer-command-label">{t`Retry`}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Retry (Ctrl+R)</Trans>
      </TooltipContent>
    </Tooltip>
  );
}

interface HistoryControlButtonProps {
  className?: string;
  handleUndo?: () => void;
  handleRedo?: () => void;
  loading?: boolean;
  saving?: boolean;
  showLabel?: boolean;
}

export function UndoControl({
  className,
  handleUndo,
  loading = false,
  saving = false,
  showLabel = false,
}: HistoryControlButtonProps) {
  const { t } = useLingui();
  const { undo } = useTaleStore();
  const effectiveUndo = handleUndo ?? undo;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={cn(historyButtonClass, className)}
          onClick={effectiveUndo}
          disabled={loading || saving}
          aria-label={t`Undo`}
        >
          <UndoIcon className="size-5 rtl:scale-x-[-1]" strokeWidth={1.5} />
          {showLabel && (
            <span className="composer-command-label">{t`Undo`}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Undo (Ctrl+Z)</Trans>
      </TooltipContent>
    </Tooltip>
  );
}

export function RedoControl({
  className,
  handleRedo,
  loading = false,
  saving = false,
  showLabel = false,
}: HistoryControlButtonProps) {
  const { t } = useLingui();
  const { redo } = useTaleStore();
  const effectiveRedo = handleRedo ?? redo;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={cn(historyButtonClass, className)}
          onClick={effectiveRedo}
          disabled={loading || saving}
          aria-label={t`Redo`}
        >
          <RedoIcon className="size-5 rtl:scale-x-[-1]" strokeWidth={1.5} />
          {showLabel && (
            <span className="composer-command-label">{t`Redo`}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Redo (Ctrl+Y)</Trans>
      </TooltipContent>
    </Tooltip>
  );
}
