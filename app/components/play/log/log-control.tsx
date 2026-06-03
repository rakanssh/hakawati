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
  MoreHorizontal,
  SquareIcon,
} from "lucide-react";
import { useTaleStore } from "@/store/useTaleStore";
import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
interface LogControlProps {
  className?: string;
  handleRetry: () => void;
  handleContinue: () => void;
  handleStop?: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function LogControl({
  className,
  loading = false,
  handleRetry,
  handleContinue,
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
      <div className="flex w-full flex-row gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-10 flex-1 bg-card/70"
              variant="outline"
              size="icon"
              onClick={undo}
              disabled={loading || saving}
              aria-label={t`Undo`}
            >
              <UndoIcon className="w-3.5 h-3.5 md:w-4 md:h-4 rtl:scale-x-[-1]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Undo (Ctrl+Z)</Trans>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              onClick={handleRetry}
              disabled={loading || saving}
              variant="outline"
              size="icon"
              className="h-10 flex-1 bg-card/70"
              aria-label={t`Retry`}
            >
              <RefreshCwIcon
                strokeWidth={1.5}
                className="w-3.5 h-3.5 md:w-4 md:h-4"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <Trans>Retry (Ctrl+R)</Trans>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={loading && handleStop ? handleStop : handleContinue}
              disabled={loading ? !handleStop : saving}
              variant="outline"
              size="icon"
              className="h-10 flex-1 bg-card/70"
              aria-label={
                loading && handleStop ? t`Stop generating` : t`Continue`
              }
            >
              {loading && handleStop ? (
                <SquareIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              ) : (
                <MoreHorizontal className="w-3.5 h-3.5 md:w-4 md:h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {loading && handleStop ? (
              <Trans>Stop generating (Esc)</Trans>
            ) : (
              <Trans>Continue</Trans>
            )}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-10 flex-1 bg-card/70"
              variant="outline"
              size="icon"
              onClick={redo}
              disabled={loading || saving}
              aria-label={t`Redo`}
            >
              <RedoIcon className="w-3.5 h-3.5 md:w-4 md:h-4 rtl:scale-x-[-1]" />
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
