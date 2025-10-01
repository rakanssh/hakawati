import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

// Import all settings components
import SettingsGame from "@/components/layout/settings/game";
import SettingsApi from "@/components/layout/settings/api";
import SettingsTale from "@/components/layout/settings/tale";
import SettingsStoryCards from "@/components/layout/settings/story-cards";
import SettingsModel from "@/components/layout/settings/model";
import SettingsUpdates from "@/components/layout/settings/updates";

const tabs = [
  { id: "game", label: "Game", component: SettingsGame },
  { id: "api", label: "API", component: SettingsApi },
  { id: "tale", label: "Tale", component: SettingsTale },
  { id: "story-cards", label: "Story Cards", component: SettingsStoryCards },
  { id: "model", label: "Model", component: SettingsModel },
  { id: "updates", label: "Updates", component: SettingsUpdates },
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

  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    const fallback =
      availableTabs.find((tab) => tab.id === defaultTab)?.id ??
      availableTabs[0]?.id ??
      DEFAULT_TAB;
    return fallback;
  });

  useEffect(() => {
    if (!open) return;
    const nextActive =
      availableTabs.find((tab) => tab.id === defaultTab)?.id ??
      availableTabs[0]?.id ??
      DEFAULT_TAB;
    setActiveTab(nextActive);
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
        showCloseButton={true}
        className="p-0 sm:max-w-[900px] w-[min(95vw,900px)] h-[min(85vh,700px)] flex flex-col"
      >
        <div className="grid grid-cols-[160px_1fr] gap-0 h-full">
          <nav className="border-r px-3 py-4 overflow-auto">
            <ul className="flex flex-col gap-1">
              {availableTabs.map((tab) => (
                <li key={tab.id}>
                  <Button
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    className="w-full justify-start text-sm"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="py-3 px-4 overflow-auto bg-card h-full">
            <ScrollArea className="flex-1 px-2 py-0 min-h-0 h-full">
              <ActiveComponent />
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
