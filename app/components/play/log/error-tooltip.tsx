import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface ErrorTooltipProps {
  error: unknown;
}

export function ErrorTooltip({ error }: ErrorTooltipProps) {
  const formatError = (error: unknown): string => {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === "string") {
      return error;
    }
    if (typeof error === "object" && error !== null) {
      try {
        return JSON.stringify(error, null, 2);
      } catch {
        return String(error);
      }
    }
    return String(error);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-destructive/30 bg-destructive/20">
          <InfoIcon className="h-2.5 w-2.5 text-destructive" />
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs whitespace-pre-wrap break-words border-destructive/60 bg-popover text-xs text-popover-foreground"
      >
        <div className="font-semibold mb-1">Error Details:</div>
        <div>{formatError(error)}</div>
      </TooltipContent>
    </Tooltip>
  );
}
