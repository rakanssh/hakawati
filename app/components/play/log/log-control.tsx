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

interface LogControlShortcutProps {
  handleRetry: () => void;
  handleStop?: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function useLogControlShortcuts({
  loading = false,
  handleRetry,
  handleStop,
  saving = false,
}: LogControlShortcutProps) {
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
}

interface RetryControlProps {
  className?: string;
  handleRetry: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function RetryControl({
  className,
  handleRetry,
  loading = false,
  saving = false,
}: RetryControlProps) {
  const { t } = useLingui();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "composer-command-button !h-10 !w-10 min-w-10 shrink-0 border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-border hover:bg-muted/45 hover:text-foreground md:!h-9 md:!w-9",
            className,
          )}
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
  );
}

interface HistoryControlButtonProps {
  className?: string;
  loading?: boolean;
  saving?: boolean;
}

export function UndoControl({
  className,
  loading = false,
  saving = false,
}: HistoryControlButtonProps) {
  const { t } = useLingui();
  const { undo } = useTaleStore();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "!h-10 !w-10 border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-border hover:bg-muted/45 hover:text-foreground md:!h-9 md:!w-9",
            className,
          )}
          onClick={undo}
          disabled={loading || saving}
          aria-label={t`Undo`}
        >
          <UndoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
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
  loading = false,
  saving = false,
}: HistoryControlButtonProps) {
  const { t } = useLingui();
  const { redo } = useTaleStore();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "!h-10 !w-10 border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-border hover:bg-muted/45 hover:text-foreground md:!h-9 md:!w-9",
            className,
          )}
          onClick={redo}
          disabled={loading || saving}
          aria-label={t`Redo`}
        >
          <RedoIcon className="h-4 w-4 rtl:scale-x-[-1]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Redo (Ctrl+Y)</Trans>
      </TooltipContent>
    </Tooltip>
  );
}

export function HistoryControls({
  className,
  loading = false,
  saving = false,
}: HistoryControlButtonProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <UndoControl loading={loading} saving={saving} />
      <RedoControl loading={loading} saving={saving} />
    </div>
  );
}

interface LogControlProps extends LogControlShortcutProps {
  className?: string;
}

export function LogControl({
  className,
  loading = false,
  handleRetry,
  handleStop,
  saving = false,
}: LogControlProps) {
  useLogControlShortcuts({ handleRetry, handleStop, loading, saving });

  return (
    <div className={cn("min-w-0 flex-[3_1_0]", className)}>
      <div className="flex w-full flex-row gap-1">
        <RetryControl
          handleRetry={handleRetry}
          loading={loading}
          saving={saving}
          className="flex-1 bg-card/70"
        />
        <HistoryControls
          loading={loading}
          saving={saving}
          className="rounded-xs bg-card/70"
        />
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
          variant="ghost"
          size="icon"
          className={className}
          aria-label={canStop ? t`Stop generating` : t`Continue`}
        >
          {canStop ? (
            <SquareIcon className="h-4 w-4" />
          ) : (
            <MoreHorizontalIcon className="h-4 w-4" />
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
