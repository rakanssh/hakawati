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
import { useSettingsModalStore } from "@/store/useSettingsModalStore";
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
  const { t, i18n } = useLingui();
  const narrator = useSettingsStore((state) => state.modelRoles.narrator);
  const connection = useSettingsStore((state) =>
    findConnection(state.connections, narrator.connectionId),
  );
  const connectionName = useConnectionNames();
  const contextWindow = useSettingsStore((state) => state.contextWindow);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const modelContextLength = useSettingsStore(
    (state) => state.modelContextLength,
  );
  const setContextWindow = useSettingsStore((state) => state.setContextWindow);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const openSettings = useSettingsModalStore((state) => state.openSettings);

  const isChatGpt = narrator.activePreset === ApiPreset.CHATGPT;
  const knownLimit =
    modelContextLength > 0 && modelContextLength < Number.MAX_SAFE_INTEGER;
  const limit = knownLimit
    ? new Intl.NumberFormat(i18n.locale).format(modelContextLength)
    : null;
  const maxValue = knownLimit ? modelContextLength : Number.MAX_SAFE_INTEGER;

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Narrator</Trans>}>
        <SetupList>
          {connection ? (
            <>
              <LinkRow
                leading={<ProviderBadge preset={connection.preset} />}
                title={connectionName(connection)}
                onClick={() => openSettings("ai-setup")}
              />
              <BlockRow title={<Trans>Model</Trans>}>
                <ModelSelect role="narrator" />
              </BlockRow>
            </>
          ) : (
            <LinkRow
              title={<Trans>Set up the Narrator to play</Trans>}
              detailClassName="text-destructive"
              onClick={() => openSettings("ai-setup")}
            />
          )}
        </SetupList>
      </SetupSection>

      {connection ? <ThinkingLevel role="narrator" /> : null}

      {connection ? (
        <SetupSection title={<Trans>Length</Trans>}>
          <SetupList>
            <PlainRow className="flex-wrap">
              <RowText
                title={<Trans>Context window</Trans>}
                detail={limit ? <Trans>Up to {limit} tokens</Trans> : undefined}
              />
              <NumberInput
                min={1}
                max={maxValue}
                step={1}
                value={contextWindow}
                align="right"
                aria-label={t`Context window`}
                className={fieldClass}
                onValueCommit={setContextWindow}
              />
            </PlainRow>
            {isChatGpt ? null : (
              <PlainRow className="flex-wrap">
                <RowText
                  title={<Trans>Max output tokens</Trans>}
                  detail={<Trans>Thinking and the answer share this</Trans>}
                />
                <NumberInput
                  min={1}
                  max={maxValue}
                  step={1}
                  value={maxTokens}
                  align="right"
                  aria-label={t`Max output tokens`}
                  className={fieldClass}
                  onValueCommit={setMaxTokens}
                />
              </PlainRow>
            )}
          </SetupList>
          {!isModelRoleConfigured(narrator) ? (
            <p className="px-0.5 text-sm text-muted-foreground">
              <Trans>Choose a model above before you continue the story.</Trans>
            </p>
          ) : null}
        </SetupSection>
      ) : null}

      <SetupList>
        <LinkRow
          title={<Trans>All AI settings</Trans>}
          onClick={() => openSettings("generation")}
        />
      </SetupList>
    </div>
  );
}
