import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SettingsButton, TaleSettingsButton } from "./settings";
import { useTaleStore } from "@/store/useTaleStore";

export function MobilePlayHeader() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { isMobilePlatform } = useIsMobile();
  const taleName = useTaleStore((state) => state.name);

  if (!isMobilePlatform) return null;
  if (!routerState.location.pathname?.startsWith("/play")) return null;

  return (
    <div
      className="pointer-events-none fixed top-0 inset-x-0 z-50 flex items-center gap-2 p-2"
      style={{
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
        paddingInlineStart: "calc(0.5rem + env(safe-area-inset-left))",
        paddingInlineEnd: "calc(0.5rem + env(safe-area-inset-right))",
      }}
    >
      <div className="min-w-0 flex-1">
        {taleName.trim() && (
          <span
            dir="auto"
            className="block w-fit max-w-full truncate rounded-full bg-input/75 px-3 py-1 text-sm font-medium text-foreground"
            title={taleName}
          >
            {taleName}
          </span>
        )}
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate({ to: "/" })}
        className="pointer-events-auto h-8 w-8 shrink-0 p-0 bg-input/75 text-foreground rounded-full"
      >
        <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
      </Button>
      <TaleSettingsButton
        variant="default"
        size="sm"
        className="pointer-events-auto h-8 w-8 shrink-0 rounded-full bg-input/75 text-foreground"
      />
      <SettingsButton
        variant="default"
        size="sm"
        className="pointer-events-auto h-8 w-8 shrink-0 rounded-full bg-input/75 text-foreground"
      />
    </div>
  );
}
