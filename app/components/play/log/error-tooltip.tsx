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
        <div className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 border border-red-500/30 cursor-help ml-1 shrink-0">
          <InfoIcon className="w-2.5 h-2.5 text-red-500" />
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="text-xs max-w-xs whitespace-pre-wrap break-words bg-red-900/90 text-red-100 border-red-700"
      >
        <div className="font-semibold mb-1">Error Details:</div>
        <div>{formatError(error)}</div>
      </TooltipContent>
    </Tooltip>
  );
}
