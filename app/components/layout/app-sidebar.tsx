import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/game";


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {




  return (
    <Sidebar variant="inset" className="bg-background p-0" {...props}>
      <SidebarContent className="flex flex-col gap-2 bg-background gap-bottom-2 p-2">
        <div className="flex flex-row items-center justify-between gap-2 mt-2"></div>
        <Separator />
        <InventoryCard />
        <StatsCard />
      </SidebarContent>
    </Sidebar>
  );
}
