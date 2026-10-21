import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { isPresetAllowedForRole } from "@/data/api-presets";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset, type ModelRole } from "@/types";
import { useSettingsNavigation } from "../settings-shell";
import { pageKey } from "./pages";
import { ProviderBadge } from "./parts";
import { LinkRow, SetupList } from "../settings-rows";

interface ProviderOption {
  preset: ApiPreset;
  title: ReactNode;
  detail: ReactNode;
}

const PROVIDERS: ProviderOption[] = [
  {
    preset: ApiPreset.CHATGPT,
    title: <Trans>ChatGPT plan</Trans>,
    detail: (
      <Trans>Sign in with your ChatGPT account. No key, no extra bill.</Trans>
    ),
  },
  {
    preset: ApiPreset.OPENROUTER,
    title: <Trans>OpenRouter</Trans>,
    detail: (
      <Trans>One key for hundreds of models, some free. Pay per use.</Trans>
    ),
  },
  {
    preset: ApiPreset.OPENAI,
    title: <Trans>OpenAI</Trans>,
    detail: <Trans>The official API, with your OpenAI key</Trans>,
  },
  {
    preset: ApiPreset.NANOGPT,
    title: <Trans>NanoGPT</Trans>,
    detail: <Trans>Pay per use, many open models</Trans>,
  },
  {
    preset: ApiPreset.LOCAL,
    title: <Trans>A server on your network</Trans>,
    detail: <Trans>Ollama, LM Studio, KoboldCpp…</Trans>,
  },
  {
    preset: ApiPreset.GENERIC,
    title: <Trans>Another provider</Trans>,
    detail: <Trans>Any OpenAI-compatible address</Trans>,
  },
];

/** Gives a new connection to the role it was added for, or to a narrator that has none. */
export function useAssignNewConnection(role?: ModelRole) {
  const setRoleConnection = useSettingsStore(
    (state) => state.setRoleConnection,
  );
  return (connectionId: string): ModelRole | undefined => {
    const target =
      role ??
      (useSettingsStore.getState().roleAssignments.narrator.connectionId
        ? undefined
        : "narrator");
    if (target) setRoleConnection(target, connectionId);
    return target;
  };
}

export function AddConnection({ role }: { role?: ModelRole }) {
  const navigation = useSettingsNavigation();
  const addConnection = useSettingsStore((state) => state.addConnection);
  const assign = useAssignNewConnection(role);

  function choose(preset: ApiPreset) {
    if (preset === ApiPreset.CHATGPT) {
      // Nothing to type: the connection page signs in.
      const id = addConnection({ preset });
      assign(id);
      navigation.replace(pageKey({ kind: "connection", id }));
      return;
    }
    navigation.push(pageKey({ kind: "new", preset, role }));
  }

  return (
    <SetupList>
      {PROVIDERS.filter(
        (option) => !role || isPresetAllowedForRole(option.preset, role),
      ).map((option) => (
        <LinkRow
          key={option.preset}
          leading={<ProviderBadge preset={option.preset} />}
          title={option.title}
          detail={option.detail}
          onClick={() => choose(option.preset)}
        />
      ))}
    </SetupList>
  );
}
