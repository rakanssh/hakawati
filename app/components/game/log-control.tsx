import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  UndoIcon,
  RedoIcon,
  RefreshCwIcon,
  MoreHorizontal,
} from "lucide-react";
import { useTaleStore } from "@/store/useTaleStore";
interface LogControlProps {
  className?: string;
  handleRetry: () => void;
  handleContinue: () => void;
  loading?: boolean;
  saving?: boolean;
}

export function LogControl({
  className,
  loading = false,
  handleRetry,
  handleContinue,
  saving = false,
}: LogControlProps) {
  const { undo, redo } = useTaleStore();

  return (
    <div className={className}>
      <div className="flex flex-row w-full gap-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="rounded-none rounded-l-xs"
              variant="default"
              size="icon"
              onClick={undo}
              disabled={loading || saving}
            >
              <UndoIcon className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              onClick={handleRetry}
              disabled={loading || saving}
              variant="default"
              size="icon"
              className="rounded-none"
            >
              <RefreshCwIcon strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Retry</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={loading || saving}
              variant="default"
              size="icon"
              className="rounded-none"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Continue</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="rounded-none rounded-r-xs"
              variant="default"
              size="icon"
              onClick={redo}
              disabled={loading || saving}
            >
              <RedoIcon className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
