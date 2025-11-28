import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateStore } from "@/store/useUpdateStore";

import SettingsGame from "@/components/layout/settings/game";
import SettingsApi from "@/components/layout/settings/api";
import SettingsTale from "@/components/layout/settings/tale";
import SettingsStoryCards from "@/components/layout/settings/story-cards";
import SettingsModel from "@/components/layout/settings/model";
import SettingsAdvanced from "@/components/layout/settings/advanced";
import SettingsUpdates from "@/components/layout/settings/updates";
import SettingsAbout from "@/components/layout/settings/about";
import { useIsMobile } from "@/hooks/useIsMobile";

const tabs = [
  { id: "game", label: "Game", component: SettingsGame },
  { id: "api", label: "API", component: SettingsApi },
  { id: "tale", label: "Tale", component: SettingsTale },
  { id: "story-cards", label: "Story Cards", component: SettingsStoryCards },
  { id: "model", label: "Model", component: SettingsModel },
  { id: "advanced", label: "Advanced", component: SettingsAdvanced },
  { id: "updates", label: "Updates", component: SettingsUpdates },
  { id: "about", label: "About", component: SettingsAbout },
] as const;

type Tab = (typeof tabs)[number];
export type SettingsTabId = Tab["id"];

const DEFAULT_TAB: SettingsTabId = "game";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: SettingsTabId;
  visibleTabs?: readonly SettingsTabId[];
}

export function SettingsModal({
  open,
  onOpenChange,
  defaultTab = DEFAULT_TAB,
  visibleTabs,
}: SettingsModalProps) {
  const availableTabs = useMemo(() => {
    if (!visibleTabs) return tabs;
    const allowed = new Set(visibleTabs);
    const filtered = tabs.filter((tab) => allowed.has(tab.id));
    return filtered.length > 0 ? filtered : tabs;
  }, [visibleTabs]);

  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  const { isMobileViewport } = useIsMobile();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    const fallback =
      availableTabs.find((tab) => tab.id === defaultTab)?.id ??
      availableTabs[0]?.id ??
      DEFAULT_TAB;
    return fallback;
  });

  const prevOpenRef = useRef(open);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    if (open && !wasOpen) {
      const nextActive =
        availableTabs.find((tab) => tab.id === defaultTab)?.id ??
        availableTabs[0]?.id ??
        DEFAULT_TAB;
      setActiveTab(nextActive);
    }
    prevOpenRef.current = open;
  }, [open, defaultTab, availableTabs]);

  useEffect(() => {
    const isActiveAvailable = availableTabs.some((tab) => tab.id === activeTab);
    if (isActiveAvailable) return;
    const fallback = availableTabs[0]?.id ?? DEFAULT_TAB;
    if (fallback !== activeTab) {
      setActiveTab(fallback);
    }
  }, [availableTabs, activeTab]);

  const ActiveComponent =
    availableTabs.find((tab) => tab.id === activeTab)?.component ||
    availableTabs[0]?.component ||
    SettingsGame;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!isMobileViewport}
        className="p-0 gap-0 w-[95vw] h-[90vh] sm:max-w-[1300px] sm:max-h-[900px] flex flex-col"
      >
        <DialogTitle></DialogTitle>
        <div className="md:hidden border-b px-4 py-3">
          <Select
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsTabId)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTabs.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  <span className="flex items-center gap-2">
                    {tab.label}
                    {tab.id === "updates" && hasUpdateNotification && (
                      <span className="inline-flex h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop & Mobile content */}
        <div className="md:grid md:grid-cols-[160px_1fr] gap-0 flex-1 overflow-hidden flex flex-col">
          {/* Desktop: Sidebar navigation */}
          <nav className="hidden md:block border-r px-3 py-4 overflow-auto">
            <ul className="flex flex-col gap-1">
              {availableTabs.map((tab) => (
                <li key={tab.id}>
                  <Button
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    className="relative w-full justify-start text-sm"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {tab.id === "updates" && hasUpdateNotification ? (
                      <span
                        aria-hidden
                        className="absolute right-3 top-1/2 inline-flex h-2 w-2 -translate-y-1/2 rounded-full bg-destructive"
                      />
                    ) : null}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content area */}
          <section className="py-3 bg-card h-full overflow-hidden flex flex-col">
            <h2 className="px-4 pb-3 text-lg font-semibold border-b mb-3">
              {availableTabs.find((tab) => tab.id === activeTab)?.label ??
                "Settings"}
            </h2>
            <ScrollArea className="flex-1">
              <div className="px-4">
                <ActiveComponent />
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
