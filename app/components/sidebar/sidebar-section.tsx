import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const sidebarChipClass =
  "min-h-6 cursor-pointer border-sidebar-border/80 bg-sidebar-accent/35 px-2.5 py-1 text-start text-xs font-medium text-sidebar-foreground whitespace-normal text-wrap hover:bg-sidebar-accent/60 dark:border-sidebar-foreground/25 dark:bg-sidebar-accent/60 dark:hover:bg-sidebar-accent/80";

export const sidebarEmptyLabelClass = "text-xs text-sidebar-foreground/55";

interface SidebarSectionHeaderProps {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
}

export function SidebarSectionHeader({
  children,
  actionLabel,
  onAction,
}: SidebarSectionHeaderProps) {
  return (
    <div className="flex-shrink-0">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Label className="text-[0.8rem] font-semibold text-sidebar-foreground/90">
          {children}
        </Label>
        <Button
          className="size-7 p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
          variant="ghost"
          size="icon"
          onClick={onAction}
          aria-label={actionLabel}
        >
          <PlusIcon className="w-4 h-4" />
        </Button>
      </div>
      <Separator className="bg-sidebar-border/80 dark:bg-sidebar-foreground/20" />
    </div>
  );
}
