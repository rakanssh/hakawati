import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { InventoryCard, StatsCard } from "@/components/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" className="bg-background p-0" {...props}>
      <SidebarContent className="flex flex-col gap-2 bg-background p-2 min-h-0">
        <Separator className="flex-shrink-0" />
        <InventoryCard className="mt-4 flex-shrink min-h-0 max-h-[40%]" />
        <StatsCard className="flex-shrink min-h-0 flex-1" />
      </SidebarContent>
    </Sidebar>
  );
}
