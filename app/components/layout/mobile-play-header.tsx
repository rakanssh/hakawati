import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SettingsButton, TaleSettingsButton } from "./settings";

export function MobilePlayHeader() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { isMobilePlatform } = useIsMobile();

  if (!isMobilePlatform) return null;
  if (!routerState.location.pathname?.startsWith("/play")) return null;

  return (
    <div
      className="fixed top-0 right-0 z-50 flex items-center gap-2 p-2"
      style={{
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
        paddingRight: "calc(0.5rem + env(safe-area-inset-right))",
      }}
    >
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate({ to: "/" })}
        className="h-8 w-8 p-0 bg-input/75 text-foreground rounded-full"
      >
        <ArrowLeftIcon className="w-4 h-4" />
      </Button>
      <TaleSettingsButton
        variant="default"
        size="sm"
        className="h-8 w-8 rounded-full bg-input/75 text-foreground"
      />
      <SettingsButton
        variant="default"
        size="sm"
        className="h-8 w-8 rounded-full bg-input/75 text-foreground"
      />
    </div>
  );
}
