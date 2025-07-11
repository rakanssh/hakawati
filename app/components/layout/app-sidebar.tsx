import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/useGameStore";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const apiType = useSettingsStore((state) => state.apiType);
  const navigate = useNavigate();
  const { resetAllState } = useGameStore();
  return (
    <Sidebar variant="inset" className="bg-background" {...props}>
      <SidebarContent className="flex flex-col gap-4 bg-background">
        <div className="flex flex-row items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">TingTing</h1>
          <Badge variant="outline">{apiType}</Badge>
        </div>
        <Separator />
        <InventoryCard />
        <StatsCard />
        <Button variant="outline" onClick={resetAllState}>
          Reset
        </Button>
      </SidebarContent>
    </Sidebar>
  );
}
