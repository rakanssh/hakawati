import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { NumberInput } from "@/components/ui";
import { ModelSelect } from "@/components/layout/model-select";
import { ThinkingLevel } from "@/components/layout/settings/thinking-level";
import {
  BlockRow,
  LinkRow,
  PlainRow,
  RowText,
  SetupList,
  SetupSection,
} from "@/components/layout/settings/settings-rows";
import {
  SettingsModal,
  type GlobalSettingsSectionId,
} from "@/components/layout/settings/settings-modal";
import {
  ProviderBadge,
  useConnectionNames,
} from "@/components/layout/settings/ai-setup/parts";
import { findConnection } from "@/store/model-connections";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { ApiPreset } from "@/types";

const fieldClass = "h-9 w-24 shrink-0";

/** The few model settings worth reaching mid-story; everything else stays in Settings. */
export function AiTab() {
  const { t } = useLingui();
  const narrator = useSettingsStore((state) => state.modelRoles.narrator);
  const connection = useSettingsStore((state) =>
    findConnection(state.connections, narrator.connectionId),
  );
  const connectionName = useConnectionNames();
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
  const maxOutput =
    modelContextLength > 0 ? modelContextLength : Number.MAX_SAFE_INTEGER;

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Narrator</Trans>}>
        <SetupList>
          {connection ? (
            <>
              <LinkRow
                leading={<ProviderBadge preset={connection.preset} />}
                title={connectionName(connection)}
                onClick={() => setSettingsSection("ai-setup")}
              />
              <BlockRow title={<Trans>Model</Trans>}>
                <ModelSelect role="narrator" />
              </BlockRow>
            </>
          ) : (
            <LinkRow
              title={<Trans>Set up the Narrator to play</Trans>}
              detailClassName="text-destructive"
              onClick={() => setSettingsSection("ai-setup")}
            />
          )}
        </SetupList>
      </SetupSection>

      {connection ? <ThinkingLevel role="narrator" /> : null}

      {connection ? (
        <SetupSection title={<Trans>Replies</Trans>}>
          {isChatGpt ? (
            <p className="px-0.5 text-sm text-muted-foreground">
              <Trans>ChatGPT manages reply length and sampling.</Trans>
            </p>
          ) : (
            <SetupList>
              <PlainRow className="flex-wrap">
                <RowText
                  title={<Trans>Max output tokens</Trans>}
                  detail={<Trans>Thinking and the answer share this</Trans>}
                />
                <NumberInput
                  min={1}
                  max={maxOutput}
                  step={1}
                  value={maxTokens}
                  align="right"
                  aria-label={t`Max output tokens`}
                  className={fieldClass}
                  onValueCommit={setMaxTokens}
                />
              </PlainRow>
              <PlainRow className="flex-wrap">
                <RowText
                  title={<Trans>Temperature</Trans>}
                  detail={<Trans>Higher is less predictable</Trans>}
                />
                <NumberInput
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature ?? null}
                  allowNull
                  align="right"
                  placeholder={t`Default`}
                  aria-label={t`Temperature`}
                  className={fieldClass}
                  onValueCommit={setTemperature}
                />
              </PlainRow>
            </SetupList>
          )}
          {!isModelRoleConfigured(narrator) && !isChatGpt ? (
            <p className="px-0.5 text-sm text-muted-foreground">
              <Trans>Choose a model above before you continue the story.</Trans>
            </p>
          ) : null}
        </SetupSection>
      ) : null}

      <SetupList>
        <LinkRow
          title={<Trans>All AI settings</Trans>}
          onClick={() => setSettingsSection("generation")}
        />
      </SetupList>

      <SettingsModal
        key={settingsSection ?? "closed"}
        open={settingsSection !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsSection(null);
        }}
        defaultTab={settingsSection ?? undefined}
      />
    </div>
  );
}
