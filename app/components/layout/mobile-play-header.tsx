import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useLingui } from "@lingui/react/macro";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { SettingsButton } from "./settings";
import { StoryPanelButton } from "@/components/play/story-panel/story-panel-button";
import { useTaleStore } from "@/store/useTaleStore";

interface MobilePlayHeaderProps {
  /** Tucked away while the reader scrolls on through the story. */
  hidden?: boolean;
}

export function MobilePlayHeader({ hidden = false }: MobilePlayHeaderProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { isMobilePlatform } = useIsMobile();
  const taleName = useTaleStore((state) => state.name);

  if (!isMobilePlatform) return null;
  if (!routerState.location.pathname?.startsWith("/play")) return null;

  // Just below the status bar, over the top of the story. The fade keeps
  // scrolled story text out from under the buttons.
  return (
    <div
      inert={hidden}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex items-center gap-2 bg-linear-to-b from-background from-70% to-transparent pt-1.5 pb-3 transition-[translate,opacity] duration-200",
        hidden && "-translate-y-full opacity-0",
      )}
      style={{
        top: "env(safe-area-inset-top)",
        paddingInlineStart: "calc(0.5rem + env(safe-area-inset-left))",
        paddingInlineEnd: "calc(0.5rem + env(safe-area-inset-right))",
      }}
    >
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate({ to: "/" })}
        className="pointer-events-auto h-8 w-8 shrink-0 p-0 bg-input/75 text-foreground rounded-xs"
        aria-label={t`Back`}
      >
        <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
      </Button>
      <div className="min-w-0 flex-1">
        {taleName.trim() && (
          <span
            dir="auto"
            className="block w-fit max-w-full truncate rounded-xs bg-input/75 px-3 py-1 text-sm font-medium text-foreground"
            title={taleName}
          >
            {taleName}
          </span>
        )}
      </div>
      <SettingsButton
        variant="default"
        size="sm"
        className="pointer-events-auto h-8 w-8 shrink-0 rounded-xs bg-input/75 text-foreground"
      />
      <StoryPanelButton
        variant="default"
        size="sm"
        className="pointer-events-auto h-8 w-8 shrink-0 rounded-xs bg-input/75 text-foreground"
      />
    </div>
  );
}
