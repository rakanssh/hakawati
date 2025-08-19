import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BrushCleaningIcon, RedoIcon, UndoIcon } from "lucide-react";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { resetAllState, undo, redo } = useGameStore();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleReset = () => {
    if (confirmingReset) {
      resetAllState();
      setConfirmingReset(false);
    } else {
      setConfirmingReset(true);
      setTimeout(() => {
        setConfirmingReset(false);
      }, 3000);
    }
  };
  return (
    <Sidebar variant="inset" className="bg-background" {...props}>
      <SidebarContent className="flex flex-col gap-2 bg-background gap-bottom-2">
        <div className="flex flex-row items-center justify-between gap-2 mt-2"></div>
        <Separator />
        <InventoryCard />
        <StatsCard />
        <div className="flex flex-col mt-auto">
          <Separator className="mb-2" />
          <div className="py-0 px-0 ">
            <div className="flex flex-row items-center justify-between gap-1 ">
              <div className="flex flex-row w-full">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="flex-1 rounded-none"
                      variant="ghost"
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
                      className="flex-1/6 border-x-1 border-white/25 rounded-none"
                      size="icon"
                      variant={confirmingReset ? "destructive" : "ghost"}
                      onClick={handleReset}
                    >
                      <BrushCleaningIcon className="w-4 h-4 " />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Reset</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="flex-1 rounded-none"
                      variant="ghost"
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
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
