import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { UndoIcon, RedoIcon,  RefreshCwIcon } from "lucide-react";
import { useGameStore } from "@/store/useGameStore";
interface LogControlProps {
  className?: string;
  handleRetry: () => void;
  loading?: boolean;
}

export function LogControl({ className, loading = false, handleRetry }: LogControlProps) {
  const {  undo, redo } = useGameStore();


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
          disabled={loading}
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
              className="rounded-none rounded-r-xs"
              variant="default"
              size="icon"
              onClick={redo}
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