import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, BookOpenIcon, RedoIcon, UndoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const apiType = useSettingsStore((state) => state.apiType);
  const navigate = useNavigate();
  const { resetAllState, undo, redo } = useGameStore();
  return (
    <Sidebar variant="inset" className="bg-background" {...props}>
      <SidebarContent className="flex flex-col gap-4 bg-background">
        <div className="flex flex-row items-center gap-2 mt-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <BookOpenIcon className="w-5 h-5 mt-1" />
          <h1 className="text-2xl font-bold">Hakawati</h1>
        </div>
        <Separator />
        <InventoryCard />
        <StatsCard />
        <div className="flex flex-row gap-2">
          <Button variant="outline" size="icon" onClick={undo}>
            <UndoIcon className="w-4 h-4" />
          </Button>
          <Button className="flex-1" variant="outline" onClick={resetAllState}>
            Reset
          </Button>
          <Button variant="outline" size="icon" onClick={redo}>
            <RedoIcon className="w-4 h-4" />
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
