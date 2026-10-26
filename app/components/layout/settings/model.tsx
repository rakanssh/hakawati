import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, DicesIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store";
import { ApiPreset } from "@/types";
import {
  PlainRow,
  RowText,
  SetupList,
  SetupSection,
  useRowClass,
} from "./settings-rows";

const fieldClass = "h-9 w-28 shrink-0";

function NumberRow({
  title,
  detail,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PlainRow className="flex-wrap">
      <RowText title={title} detail={detail} />
      {children}
    </PlainRow>
  );
}

function MoreSampling({ disabled }: { disabled: boolean }) {
  const { t } = useLingui();
  const rowClass = useRowClass({ interactive: true });
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const {
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    repetitionPenalty,
    minP,
    topA,
    setTopP,
    setTopK,
    setFrequencyPenalty,
    setPresencePenalty,
    setRepetitionPenalty,
    setMinP,
    setTopA,
  } = useSettingsStore();
  const expanded = open && !disabled;
  const defaultLabel = t`Default`;

  return (
    <>
      <button
        type="button"
        className={rowClass}
        aria-expanded={expanded}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <RowText
          title={<Trans>More sampling</Trans>}
          detail={<Trans>Top P, Top K, penalties</Trans>}
        />
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div id={panelId} className="contents">
          <NumberRow title={<Trans>Top P</Trans>}>
            <NumberInput
              min={0}
              max={1}
              step={0.01}
              value={topP ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Top P`}
              className={fieldClass}
              onValueCommit={setTopP}
            />
          </NumberRow>
          <NumberRow title={<Trans>Top K</Trans>}>
            <NumberInput
              min={1}
              step={1}
              value={topK ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Top K`}
              className={fieldClass}
              onValueCommit={setTopK}
            />
          </NumberRow>
          <NumberRow title={<Trans>Min P</Trans>}>
            <NumberInput
              min={0}
              max={1}
              step={0.01}
              value={minP ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Min P`}
              className={fieldClass}
              onValueCommit={setMinP}
            />
          </NumberRow>
          <NumberRow title={<Trans>Top A</Trans>}>
            <NumberInput
              min={0}
              max={1}
              step={0.01}
              value={topA ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Top A`}
              className={fieldClass}
              onValueCommit={setTopA}
            />
          </NumberRow>
          <NumberRow title={<Trans>Frequency penalty</Trans>}>
            <NumberInput
              min={-2}
              max={2}
              step={0.1}
              value={frequencyPenalty ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Frequency penalty`}
              className={fieldClass}
              onValueCommit={setFrequencyPenalty}
            />
          </NumberRow>
          <NumberRow title={<Trans>Presence penalty</Trans>}>
            <NumberInput
              min={-2}
              max={2}
              step={0.1}
              value={presencePenalty ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Presence penalty`}
              className={fieldClass}
              onValueCommit={setPresencePenalty}
            />
          </NumberRow>
          <NumberRow title={<Trans>Repetition penalty</Trans>}>
            <NumberInput
              min={0}
              max={10}
              step={0.1}
              value={repetitionPenalty ?? null}
              allowNull
              align="right"
              placeholder={defaultLabel}
              aria-label={t`Repetition penalty`}
              className={fieldClass}
              onValueCommit={setRepetitionPenalty}
            />
          </NumberRow>
        </div>
      ) : null}
    </>
  );
}

export default function SettingsModel() {
  const { t, i18n } = useLingui();
  const activePreset = useSettingsStore(
    (state) => state.modelRoles.narrator.activePreset,
  );
  const {
    contextWindow,
    modelContextLength,
    maxTokens,
    temperature,
    seed,
    setContextWindow,
    setMaxTokens,
    setTemperature,
    setSeed,
    randomSeed,
    resetGenerationSettings,
  } = useSettingsStore();
  const isChatGpt = activePreset === ApiPreset.CHATGPT;
  const knownLimit =
    modelContextLength > 0 && modelContextLength < Number.MAX_SAFE_INTEGER;
  const limit = knownLimit
    ? new Intl.NumberFormat(i18n.locale).format(modelContextLength)
    : null;
  const maxValue = knownLimit ? modelContextLength : Number.MAX_SAFE_INTEGER;

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Length</Trans>}>
        <SetupList>
          <NumberRow
            title={<Trans>Context window</Trans>}
            detail={limit ? <Trans>Up to {limit} tokens</Trans> : undefined}
          >
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
          </NumberRow>
          {isChatGpt ? null : (
            <NumberRow
              title={<Trans>Max output tokens</Trans>}
              detail={<Trans>Thinking and the answer share this</Trans>}
            >
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
            </NumberRow>
          )}
        </SetupList>
      </SetupSection>

      <SetupSection title={<Trans>Sampling</Trans>}>
        <SetupList>
          <NumberRow title={<Trans>Temperature</Trans>}>
            <NumberInput
              min={0}
              max={2}
              step={0.1}
              value={temperature ?? null}
              allowNull
              align="right"
              placeholder={t`Default`}
              aria-label={t`Temperature`}
              disabled={isChatGpt}
              className={fieldClass}
              onValueCommit={setTemperature}
            />
          </NumberRow>
          <NumberRow title={<Trans>Seed</Trans>}>
            <div className="flex shrink-0 gap-1.5">
              <NumberInput
                min={0}
                step={1}
                value={seed}
                align="right"
                aria-label={t`Seed`}
                disabled={isChatGpt}
                className={fieldClass}
                onValueCommit={setSeed}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                aria-label={t`Random seed`}
                disabled={isChatGpt}
                onClick={randomSeed}
              >
                <DicesIcon className="size-4" />
              </Button>
            </div>
          </NumberRow>
          <MoreSampling disabled={isChatGpt} />
        </SetupList>
      </SetupSection>

      <Button
        variant="ghost"
        className="self-start px-1 text-destructive hover:text-destructive"
        onClick={resetGenerationSettings}
      >
        <Trans>Reset generation settings</Trans>
      </Button>
    </div>
  );
}
