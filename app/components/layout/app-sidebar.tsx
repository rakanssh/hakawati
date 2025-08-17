import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, RedoIcon, UndoIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";
import { SettingsButton } from "@/components/layout/settings-button";
import { useState } from "react";
import { CardContent, SquareCard } from "../ui/card";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
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
        <div className="flex flex-col mt-auto ">
          <Separator />
          <SquareCard className="p-0 m-0">
            <CardContent className="flex flex-col gap-0 p-0 m-0">
              <div className="flex flex-row gap-2 justify-between my-1 ">
                <Button variant="ghost" size="icon" onClick={undo}>
                  <UndoIcon className="w-4 h-4" />
                </Button>
                <Button
                  className="flex-1"
                  variant={confirmingReset ? "destructive" : "ghost"}
                  onClick={handleReset}
                >
                  {confirmingReset ? "Are you sure?" : "Reset"}
                </Button>
                <Button variant="ghost" size="icon" onClick={redo}>
                  <RedoIcon className="w-4 h-4" />
                </Button>
              </div>
              {/* Separator half size of the container */}
              <Separator />
              <div className="flex flex-row gap-2 justify-between my-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </Button>
                <SettingsButton />
              </div>
            </CardContent>
          </SquareCard>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
