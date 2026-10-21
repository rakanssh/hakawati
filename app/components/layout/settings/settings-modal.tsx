import {
  Bot,
  Cloud,
  DownloadCloud,
  Info,
  Palette,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Trans } from "@lingui/react/macro";
import {
  SettingsShell,
  type SettingsSectionDefinition,
} from "@/components/layout/settings/settings-shell";
import { useUpdateStore } from "@/store/useUpdateStore";
import { useIsMobile } from "@/hooks/useIsMobile";

import SettingsGame, {
  AppearanceTitle,
} from "@/components/layout/settings/game";
import SettingsAiSetup, {
  AiSetupTitle,
} from "@/components/layout/settings/ai-setup";
import SettingsModel from "@/components/layout/settings/model";
import SettingsAdvanced, {
  PromptingTitle,
} from "@/components/layout/settings/advanced";
import SettingsUpdates from "@/components/layout/settings/updates";
import SettingsAbout from "@/components/layout/settings/about";
import SettingsCloudSync, {
  CloudSyncTitle,
} from "@/components/layout/settings/cloud-sync";

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
    subpageTitle: AppearanceTitle,
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
    component: SettingsAiSetup,
    subpageTitle: AiSetupTitle,
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
    subpageTitle: PromptingTitle,
  },
  {
    id: "cloud-sync",
    label: <Trans>Account & Sync</Trans>,
    description: <Trans>Manage your account and cloud sync.</Trans>,
    groupId: "account",
    group: <Trans>Account</Trans>,
    icon: Cloud,
    component: SettingsCloudSync,
    subpageTitle: CloudSyncTitle,
  },
  {
    id: "maintenance",
    label: <Trans>Updates</Trans>,
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

export type GlobalSettingsSectionId = (typeof globalSections)[number]["id"];

const DEFAULT_GLOBAL_SECTION: GlobalSettingsSectionId = "appearance";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: GlobalSettingsSectionId;
}

// App stores deliver updates on phones.
const MOBILE_HIDDEN_SECTIONS: readonly GlobalSettingsSectionId[] = [
  "maintenance",
];
const MOBILE_SECTIONS = globalSections
  .map((section) => section.id)
  .filter((id) => !MOBILE_HIDDEN_SECTIONS.includes(id));

export function SettingsModal({
  open,
  onOpenChange,
  defaultTab = DEFAULT_GLOBAL_SECTION,
}: SettingsModalProps) {
  const { isMobilePlatform } = useIsMobile();
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
      visibleSections={isMobilePlatform ? MOBILE_SECTIONS : undefined}
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
