import { HomeIcon, SettingsIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useState } from "react";
import { QuickstartWizard } from "@/components/quickstart";
import { Trans } from "@lingui/react/macro";
import {
  SettingsModal,
  type SettingsTabId,
} from "@/components/layout/settings";

export function MobileBottomNav() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { isMobilePlatform } = useIsMobile();
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const nonPlayTabs: readonly SettingsTabId[] = ["game", "api", "model"];

  if (!isMobilePlatform) return null;
  if (routerState.location.pathname?.startsWith("/play")) return null;

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 bg-background border-t"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="grid grid-cols-3 items-center h-14 px-4">
          <div className="flex justify-start">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/" })}
              className="h-10 w-10 p-0"
            >
              <HomeIcon className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex justify-center">
            <Button
              variant="default"
              size="sm"
              onClick={() => setQuickstartOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-full"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-xs">
                <Trans>Quickstart</Trans>
              </span>
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="h-10 w-10 p-0"
            >
              <SettingsIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <QuickstartWizard
        open={quickstartOpen}
        onOpenChange={setQuickstartOpen}
      />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab="api"
        visibleTabs={nonPlayTabs}
      />
    </>
  );
}
