import {
  Bot,
  BookOpen,
  Cloud,
  DownloadCloud,
  Info,
  Library,
  Palette,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Trans } from "@lingui/react/macro";
import {
  SettingsShell,
  type SettingsSectionDefinition,
} from "@/components/layout/settings/settings-shell";
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
import SettingsCloudSync from "@/components/layout/settings/cloud-sync";

const globalSections = [
  {
    id: "appearance",
    label: <Trans>Appearance</Trans>,
    description: (
      <Trans>Control the app theme, reading comfort, and language.</Trans>
    ),
    groupId: "app",
    group: <Trans>App</Trans>,
    icon: Palette,
    component: SettingsGame,
  },
  {
    id: "ai-setup",
    label: <Trans>AI Setup</Trans>,
    description: (
      <Trans>Connect a provider, choose an endpoint, and pick a model.</Trans>
    ),
    groupId: "ai",
    group: <Trans>AI</Trans>,
    icon: Bot,
    component: SettingsApi,
  },
  {
    id: "generation",
    label: <Trans>Generation</Trans>,
    description: (
      <Trans>Tune token budgets, sampling, and repeatable seeds.</Trans>
    ),
    groupId: "ai",
    group: <Trans>AI</Trans>,
    icon: SlidersHorizontal,
    component: SettingsModel,
  },
  {
    id: "prompting",
    label: <Trans>Prompting</Trans>,
    description: <Trans>Customize the system prompts used by Hakawati.</Trans>,
    groupId: "ai",
    group: <Trans>AI</Trans>,
    icon: Sparkles,
    component: SettingsAdvanced,
  },
  {
    id: "cloud-sync",
    label: <Trans>Cloud Sync</Trans>,
    description: (
      <Trans>Connect cloud saves and move tales between devices.</Trans>
    ),
    groupId: "app",
    group: <Trans>App</Trans>,
    icon: Cloud,
    component: SettingsCloudSync,
  },
  {
    id: "maintenance",
    label: <Trans>Maintenance</Trans>,
    description: <Trans>Check for app updates and install new versions.</Trans>,
    groupId: "support",
    group: <Trans>Support</Trans>,
    icon: DownloadCloud,
    component: SettingsUpdates,
  },
  {
    id: "about",
    label: <Trans>About</Trans>,
    description: (
      <Trans>Review license, dependency, and credit information.</Trans>
    ),
    groupId: "support",
    group: <Trans>Support</Trans>,
    icon: Info,
    component: SettingsAbout,
  },
] as const satisfies readonly SettingsSectionDefinition[];

const taleSections = [
  {
    id: "story",
    label: <Trans>Story</Trans>,
    description: (
      <Trans>Adjust the active tale mode, setup, and author notes.</Trans>
    ),
    groupId: "tale",
    group: <Trans>Tale</Trans>,
    icon: BookOpen,
    component: SettingsTale,
  },
  {
    id: "character",
    label: <Trans>Character</Trans>,
    description: <Trans>Manage the stats and inventory for this tale.</Trans>,
    groupId: "tale",
    group: <Trans>Tale</Trans>,
    icon: UserRound,
    component: SettingsInventoryStats,
  },
  {
    id: "story-cards",
    label: <Trans>Story Cards</Trans>,
    description: (
      <Trans>
        Maintain the people, places, things, and concepts in memory.
      </Trans>
    ),
    groupId: "memory",
    group: <Trans>Memory</Trans>,
    icon: Library,
    component: SettingsStoryCards,
  },
] as const satisfies readonly SettingsSectionDefinition[];

export type GlobalSettingsSectionId = (typeof globalSections)[number]["id"];
export type TaleSettingsSectionId = (typeof taleSections)[number]["id"];
export type SettingsTabId = GlobalSettingsSectionId | TaleSettingsSectionId;

const DEFAULT_GLOBAL_SECTION: GlobalSettingsSectionId = "appearance";
const DEFAULT_TALE_SECTION: TaleSettingsSectionId = "story";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: GlobalSettingsSectionId;
  visibleTabs?: readonly GlobalSettingsSectionId[];
}

export function SettingsModal({
  open,
  onOpenChange,
  defaultTab = DEFAULT_GLOBAL_SECTION,
  visibleTabs,
}: SettingsModalProps) {
  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  const renderSectionExtra = (sectionId: GlobalSettingsSectionId) => {
    if (sectionId === "maintenance" && hasUpdateNotification) {
      return (
        <span
          aria-hidden
          className="absolute end-3 top-1/2 inline-flex h-2 w-2 -translate-y-1/2 rounded-full bg-destructive"
        />
      );
    }
    return null;
  };

  return (
    <SettingsShell
      open={open}
      onOpenChange={onOpenChange}
      sections={globalSections}
      defaultSection={defaultTab}
      visibleSections={visibleTabs}
      title={<Trans>Settings</Trans>}
      description={
        <Trans>
          Configure Hakawati, AI providers, generation behavior, and
          maintenance.
        </Trans>
      }
      renderSectionExtra={renderSectionExtra}
    />
  );
}

interface TaleSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: TaleSettingsSectionId;
  visibleTabs?: readonly TaleSettingsSectionId[];
}

export function TaleSettingsModal({
  open,
  onOpenChange,
  defaultTab = DEFAULT_TALE_SECTION,
  visibleTabs,
}: TaleSettingsModalProps) {
  return (
    <SettingsShell
      open={open}
      onOpenChange={onOpenChange}
      sections={taleSections}
      defaultSection={defaultTab}
      visibleSections={visibleTabs}
      title={<Trans>Tale Settings</Trans>}
      description={
        <Trans>
          Edit the active tale&apos;s story context, character state, and
          memory.
        </Trans>
      }
    />
  );
}
