import { Button } from "../../ui/button";
import { SettingsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SettingsModal, SettingsTabId } from "@/components/layout/settings";
import { useUpdateStore } from "@/store/useUpdateStore";
import { cn } from "@/lib/utils";

export function SettingsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [isOpen, setIsOpen] = useState(false);
  const routerState = useRouterState();
  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  const isPlayRoute = routerState.location.pathname?.startsWith("/play");
  const visibleTabs = useMemo<readonly SettingsTabId[]>(
    () =>
      isPlayRoute
        ? ([
            "game",
            "api",
            "tale",
            "story-cards",
            "model",
            "updates",
            "about",
          ] as const)
        : (["game", "api", "model", "updates", "about"] as const),
    [isPlayRoute],
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className={cn("relative", className)}
        {...props}
      >
        <SettingsIcon className="w-4 h-4" />
        {hasUpdateNotification ? (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-destructive"
          />
        ) : null}
      </Button>

      <SettingsModal
        open={isOpen}
        onOpenChange={setIsOpen}
        visibleTabs={visibleTabs}
      />
    </>
  );
}
