import { useState } from "react";
import { useLingui as useLinguiCore } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui";
import { ModelSelect } from "@/components/layout/model-select";
import { ThinkingLevel } from "@/components/layout/settings/thinking-level";
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";
import {
  SettingsModal,
  type GlobalSettingsSectionId,
} from "@/components/layout/settings/settings-modal";
import { apiPresetMap } from "@/data/api-presets";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { ApiPreset } from "@/types";

/** The few model settings worth reaching mid-story; everything else stays in Settings. */
export function AiTab() {
  const { t } = useLingui();
  const { _ } = useLinguiCore();
  const narrator = useSettingsStore((state) => state.modelRoles.narrator);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const temperature = useSettingsStore((state) => state.temperature);
  const modelContextLength = useSettingsStore(
    (state) => state.modelContextLength,
  );
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const [settingsSection, setSettingsSection] =
    useState<GlobalSettingsSectionId | null>(null);

  const isChatGpt = narrator.activePreset === ApiPreset.CHATGPT;
  const providerLabel = apiPresetMap[narrator.activePreset]?.label;
  const hasProvider = isChatGpt || narrator.baseUrl.trim().length > 0;
  const maxOutput =
    modelContextLength > 0 ? modelContextLength : Number.MAX_SAFE_INTEGER;

  return (
    <SettingsStack>
      <SettingsPanel title={<Trans>Narrator</Trans>}>
        {hasProvider ? (
          <>
            {providerLabel && (
              <p className="-mt-2 text-xs text-muted-foreground">
                <Trans>Using {_(providerLabel)}</Trans>
              </p>
            )}
            <SettingsField label={<Trans>Model</Trans>}>
              <ModelSelect role="narrator" />
            </SettingsField>
            <ThinkingLevel role="narrator" />
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              <Trans>
                Connect a provider to choose the model that tells your story.
              </Trans>
            </p>
            <Button
              variant="outline"
              onClick={() => setSettingsSection("ai-setup")}
            >
              <Trans>Set up AI</Trans>
            </Button>
          </div>
        )}
      </SettingsPanel>

      {hasProvider && (
        <SettingsPanel title={<Trans>Responses</Trans>}>
          {isChatGpt && (
            <p className="text-sm text-muted-foreground">
              <Trans>ChatGPT manages response length and sampling.</Trans>
            </p>
          )}
          {!isChatGpt && (
            <SettingsField
              label={<Trans>Max Output Tokens</Trans>}
              description={
                <Trans>Thinking tokens and the answer share this limit.</Trans>
              }
            >
              <NumberInput
                min={1}
                max={maxOutput}
                step={1}
                value={maxTokens}
                aria-label={t`Max output tokens`}
                onValueCommit={(value) => setMaxTokens(value)}
              />
            </SettingsField>
          )}
          <SettingsField
            label={<Trans>Temperature</Trans>}
            description={
              <Trans>Higher values make responses less predictable.</Trans>
            }
          >
            <NumberInput
              min={0}
              max={2}
              step={0.1}
              value={temperature ?? null}
              allowNull
              placeholder={t`Provider default`}
              aria-label={t`Temperature`}
              disabled={isChatGpt}
              onValueCommit={(value) => setTemperature(value)}
            />
          </SettingsField>
          {!isModelRoleConfigured(narrator) && !isChatGpt && (
            <p className="text-sm text-muted-foreground">
              <Trans>Choose a model above before you continue the story.</Trans>
            </p>
          )}
        </SettingsPanel>
      )}

      <Button
        variant="outline"
        className="self-start"
        onClick={() => setSettingsSection("generation")}
      >
        <SlidersHorizontalIcon />
        <Trans>All AI settings</Trans>
      </Button>

      <SettingsModal
        key={settingsSection ?? "closed"}
        open={settingsSection !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsSection(null);
        }}
        defaultTab={settingsSection ?? undefined}
      />
    </SettingsStack>
  );
}
