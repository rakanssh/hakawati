import { Button } from "../../ui/button";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SettingsModal, SettingsTabId } from "@/components/layout/settings";

export function SettingsButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  const [isOpen, setIsOpen] = useState(false);
  const routerState = useRouterState();

  const isPlayRoute = routerState.location.pathname?.startsWith("/play");
  const visibleTabs: readonly SettingsTabId[] = isPlayRoute
    ? ["game", "api", "tale", "story-cards", "model", "updates"]
    : ["game", "api", "model", "updates"];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        {...props}
      >
        <SettingsIcon className="w-4 h-4" />
      </Button>

      <SettingsModal
        open={isOpen}
        onOpenChange={setIsOpen}
        visibleTabs={visibleTabs}
      />
    </>
  );
}
