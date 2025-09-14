import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { HelpCircle, InfoIcon } from "lucide-react";

interface HelpTooltipProps {
  children: React.ReactNode;
}

export function HelpTooltip({ children }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs flex items-center gap-1">
        <InfoIcon className="w-3.5 h-3.5" />
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
