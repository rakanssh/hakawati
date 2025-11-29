import { Button } from "../../ui/button";
import { BookOpen } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  SettingsModal,
  type SettingsTabId,
} from "@/components/layout/settings/settings-modal";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { useTaleStore } from "@/store";
import { GameMode } from "@/types";

export function TaleSettingsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const gameMode = useTaleStore((s) => s.gameMode);

  const visibleTabs = useMemo<SettingsTabId[]>(() => {
    const tabs: SettingsTabId[] = ["tale", "story-cards"];
    if (gameMode === GameMode.GM) {
      tabs.unshift("inventory-stats");
    }
    return tabs;
  }, [gameMode]);

  // Close tooltip when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTooltipOpen(false);
    }
  }, [isOpen]);

  return (
    <>
      <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(true)}
            className={cn("relative", className)}
            {...props}
          >
            <BookOpen className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Tale Settings</TooltipContent>
      </Tooltip>

      <SettingsModal
        open={isOpen}
        onOpenChange={setIsOpen}
        visibleTabs={visibleTabs}
        defaultTab={visibleTabs[0]}
      />
    </>
  );
}
