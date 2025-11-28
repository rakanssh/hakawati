import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" className="bg-background p-0" {...props}>
      <SidebarContent className="flex flex-col gap-2 bg-background gap-bottom-2 p-2">
        <Separator />
        <InventoryCard />
        <StatsCard />
      </SidebarContent>
    </Sidebar>
  );
}
