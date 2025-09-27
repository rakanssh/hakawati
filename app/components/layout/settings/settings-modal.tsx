import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

// Import all settings components
import SettingsGame from "@/components/layout/settings/game";
import SettingsApi from "@/components/layout/settings/api";
import SettingsTale from "@/components/layout/settings/tale";
import SettingsStoryCards from "@/components/layout/settings/story-cards";
import SettingsModel from "@/components/layout/settings/model";

const tabs = [
  { id: "game", label: "Game", component: SettingsGame },
  { id: "api", label: "API", component: SettingsApi },
  { id: "tale", label: "Tale", component: SettingsTale },
  { id: "story-cards", label: "Story Cards", component: SettingsStoryCards },
  { id: "model", label: "Model", component: SettingsModel },
] as const;

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
}

export function SettingsModal({
  open,
  onOpenChange,
  defaultTab = "game",
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  useEffect(() => {
    if (open && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const ActiveComponent =
    tabs.find((tab) => tab.id === activeTab)?.component || SettingsGame;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true}
        className="p-0 sm:max-w-[900px] w-[min(95vw,900px)] h-[min(85vh,700px)] flex flex-col"
      >
        <div className="grid grid-cols-[160px_1fr] gap-0 h-full">
          <nav className="border-r px-3 py-4 overflow-auto">
            <ul className="flex flex-col gap-1">
              {tabs.map((tab) => (
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
