import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BrushCleaningIcon, RedoIcon, UndoIcon } from "lucide-react";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Card, CardContent } from "../ui/card";

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
    <Sidebar variant="inset" className="bg-background p-0" {...props}>
      <SidebarContent className="flex flex-col gap-2 bg-background gap-bottom-2 p-2">
        <div className="flex flex-row items-center justify-between gap-2 mt-2"></div>
        <Separator />
        <InventoryCard />
        <StatsCard />
      </SidebarContent>
      <div className="flex flex-col pb-2 border-r-1">
        <Separator className="mb-2" />
        <div className="py-0 px-2 ">
          <Card className="flex flex-row items-center justify-between gap-1 rounded-none border-none shadow-none p-0 m-0">
            <CardContent className="flex flex-row w-full p-0 m-0 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="flex-1 rounded-xs"
                    variant="outline"
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
                    className="flex-1/6  rounded-xs"
                    size="icon"
                    variant={confirmingReset ? "destructive" : "outline"}
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
                    className="flex-1 rounded-xs"
                    variant="outline"
                    size="icon"
                    onClick={redo}
                  >
                    <RedoIcon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Redo (Ctrl+Y)</TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>
        </div>
      </div>
    </Sidebar>
  );
}
