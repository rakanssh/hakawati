import { Trans } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import {
  BookOpenIcon,
  GlobeIcon,
  MicIcon,
  ServerIcon,
  Volume2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { apiPresetMap } from "@/data/api-presets";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiConnection, ApiPreset, type ModelRole } from "@/types";

export function RoleName({ role }: { role: ModelRole }) {
  switch (role) {
    case "narrator":
      return <Trans>Narrator</Trans>;
    case "utility":
      return <Trans>Helper</Trans>;
    case "speechToText":
      return <Trans>Speech to Text</Trans>;
    case "textToSpeech":
      return <Trans>Text to Speech</Trans>;
  }
}

const ROLE_ICONS = {
  narrator: BookOpenIcon,
  utility: WandSparklesIcon,
  speechToText: MicIcon,
  textToSpeech: Volume2Icon,
} as const;

export function RoleIcon({ role, off }: { role: ModelRole; off?: boolean }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xs",
        off ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

const MONOGRAMS: Partial<Record<ApiPreset, string>> = {
  [ApiPreset.CHATGPT]: "GPT",
  [ApiPreset.OPENROUTER]: "OR",
  [ApiPreset.OPENAI]: "AI",
  [ApiPreset.NANOGPT]: "NG",
};

export function ProviderBadge({ preset }: { preset: ApiPreset }) {
  const monogram = MONOGRAMS[preset];
  const Icon = preset === ApiPreset.LOCAL ? ServerIcon : GlobeIcon;
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-xs bg-primary/15 text-[0.7rem] font-bold tracking-wide text-primary"
    >
      {monogram ?? <Icon className="size-4" />}
    </span>
  );
}

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.trim();
  }
}

export function keyTail(apiKey: string) {
  return apiKey.trim().slice(-4);
}

/** Names connections, telling apart two saved for the same provider. */
export function useConnectionNames() {
  const { _ } = useLinguiCore();
  const connections = useSettingsStore((state) => state.connections);
  const base = (connection: ApiConnection) => {
    if (connection.label) return connection.label;
    const preset = apiPresetMap[connection.preset];
    if (preset.editableUrl && connection.baseUrl) {
      return hostOf(connection.baseUrl);
    }
    return _(preset.label);
  };
  return (connection: ApiConnection) => {
    const name = base(connection);
    const twin = connections.some(
      (other) => other.id !== connection.id && base(other) === name,
    );
    return twin && connection.apiKey
      ? `${name} · ${keyTail(connection.apiKey)}`
      : name;
  };
}
