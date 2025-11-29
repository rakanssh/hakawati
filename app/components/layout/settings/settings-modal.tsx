import { TabbedModal, type TabDefinition } from "@/components/ui/tabbed-modal";
import { useUpdateStore } from "@/store/useUpdateStore";

import SettingsGame from "@/components/layout/settings/game";
import SettingsApi from "@/components/layout/settings/api";
import SettingsModel from "@/components/layout/settings/model";
import SettingsAdvanced from "@/components/layout/settings/advanced";
import SettingsUpdates from "@/components/layout/settings/updates";
import SettingsAbout from "@/components/layout/settings/about";
import SettingsTale from "@/components/layout/settings/tale";
import SettingsStoryCards from "@/components/layout/settings/story-cards";
import SettingsInventoryStats from "@/components/layout/settings/inventory-stats";

const tabs = [
  { id: "game", label: "Game", component: SettingsGame },
  { id: "api", label: "API", component: SettingsApi },
  { id: "model", label: "Model", component: SettingsModel },
  { id: "advanced", label: "Advanced", component: SettingsAdvanced },
  { id: "updates", label: "Updates", component: SettingsUpdates },
  { id: "about", label: "About", component: SettingsAbout },
  { id: "tale", label: "Tale", component: SettingsTale },
  {
    id: "inventory-stats",
    label: "Character",
    component: SettingsInventoryStats,
  },
  { id: "story-cards", label: "Story Cards", component: SettingsStoryCards },
] as const satisfies readonly TabDefinition[];

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
  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  const renderTabExtra = (tabId: SettingsTabId) => {
    if (tabId === "updates" && hasUpdateNotification) {
      return (
        <span
          aria-hidden
          className="absolute right-3 top-1/2 inline-flex h-2 w-2 -translate-y-1/2 rounded-full bg-destructive"
        />
      );
    }
    return null;
  };

  return (
    <TabbedModal
      open={open}
      onOpenChange={onOpenChange}
      tabs={tabs}
      defaultTab={defaultTab}
      visibleTabs={visibleTabs}
      title="Settings"
      renderTabExtra={renderTabExtra}
    />
  );
}
