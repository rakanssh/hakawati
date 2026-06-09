import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { InventoryCard, StatsCard } from "@/components/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      variant="inset"
      className="border-e border-sidebar-border/70 bg-sidebar/80 p-0 backdrop-blur-xl"
      {...props}
    >
      <SidebarContent className="flex min-h-0 flex-col gap-5 bg-transparent px-4 pt-10 pb-4">
        <InventoryCard className="min-h-0 max-h-[40%] flex-shrink" />
        <StatsCard className="min-h-0 flex-1 flex-shrink" />
      </SidebarContent>
    </Sidebar>
  );
}
