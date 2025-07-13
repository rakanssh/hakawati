import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, BookOpenIcon, RedoIcon, UndoIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";
import { SettingsModal } from "@/components/layout";
import { useState } from "react";

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
      <SidebarContent className="flex flex-col gap-4 bg-background">
        <div className="flex flex-row items-center justify-between gap-2 mt-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <BookOpenIcon className="w-5 h-5 mt-1" />
          <h1 className="text-2xl font-bold">Hakawati</h1>
          <SettingsModal />
        </div>
        <Separator />
        <InventoryCard />
        <StatsCard />
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2">
            <Button variant="interactive-ghost" size="icon" onClick={undo}>
              <UndoIcon className="w-4 h-4" />
            </Button>
            <Button
              className="flex-1"
              variant={confirmingReset ? "destructive" : "interactive-ghost"}
              onClick={handleReset}
            >
              {confirmingReset ? "Are you sure?" : "Reset"}
            </Button>
            <Button variant="interactive-ghost" size="icon" onClick={redo}>
              <RedoIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
