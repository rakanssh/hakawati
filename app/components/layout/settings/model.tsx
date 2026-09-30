import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSettingsStore } from "@/store";
import { DicesIcon, InfoIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ApiPreset } from "@/types";
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";

export default function SettingsModel() {
  const { t } = useLingui();
  const {
    activePreset,
    contextWindow,
    modelContextLength,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    repetitionPenalty,
    minP,
    topA,
    seed,
    setContextWindow,
    setMaxTokens,
    setTemperature,
    setTopP,
    setTopK,
    setFrequencyPenalty,
    setPresencePenalty,
    setRepetitionPenalty,
    setMinP,
    setTopA,
    setSeed,
    randomSeed,
    setToDefault,
  } = useSettingsStore();
  const isChatGpt = activePreset === ApiPreset.CHATGPT;

  const modelLimit =
    modelContextLength > 0 && modelContextLength < Number.MAX_SAFE_INTEGER
      ? Intl.NumberFormat().format(modelContextLength)
      : null;
  const maxContextValue =
    modelContextLength > 0 ? modelContextLength : Number.MAX_SAFE_INTEGER;

  return (
    <SettingsStack>
      <SettingsPanel title={<Trans>Core generation</Trans>}>
        {isChatGpt && (
          <p className="text-sm text-muted-foreground">
            <Trans>
              ChatGPT manages output length and sampling. Your sampling settings
              are preserved for other providers.
            </Trans>
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField
            label={
              <span className="inline-flex items-center gap-2">
                <Trans>Context Window</Trans>
                {modelLimit ? ` (0 - ${modelLimit})` : ""}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Context window help`}
                      className="-my-1 size-7"
                    >
                      <InfoIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Trans>Maximum is determined by current model.</Trans>
                  </TooltipContent>
                </Tooltip>
              </span>
            }
          >
            <NumberInput
              min={1}
              max={maxContextValue}
              step={1}
              value={contextWindow}
              aria-label={t`Context window`}
              onValueCommit={(val) => setContextWindow(val)}
            />
          </SettingsField>

          <SettingsField
            label={
              <>
                {isChatGpt ? (
                  <Trans>Response space in context</Trans>
                ) : (
                  <Trans>Max Output Tokens</Trans>
                )}
                {modelLimit ? ` (1 - ${modelLimit})` : ""}
              </>
            }
            description={
              isChatGpt ? (
                <Trans>
                  Reserves room when selecting story history. This does not
                  limit ChatGPT’s response length.
                </Trans>
              ) : undefined
            }
          >
            <NumberInput
              min={1}
              max={maxContextValue}
              step={1}
              value={maxTokens}
              aria-label={
                isChatGpt ? t`Response space in context` : t`Max output tokens`
              }
              onValueCommit={(val) => setMaxTokens(val)}
            />
          </SettingsField>

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
              onValueCommit={(val) => setTemperature(val)}
            />
          </SettingsField>

          <SettingsField
            label={<Trans>Seed</Trans>}
            description={
              <Trans>Reuse a seed for more repeatable generations.</Trans>
            }
          >
            <div className="flex gap-2">
              <NumberInput
                min={0}
                step={1}
                value={seed}
                className="flex-1"
                aria-label={t`Seed`}
                disabled={isChatGpt}
                onValueCommit={(val) => setSeed(val)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t`Randomize seed`}
                    disabled={isChatGpt}
                    onClick={randomSeed}
                  >
                    <DicesIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Randomize seed</Trans>
                </TooltipContent>
              </Tooltip>
            </div>
          </SettingsField>
        </div>
      </SettingsPanel>

      <SettingsPanel title={<Trans>Advanced sampling</Trans>}>
        <Accordion
          type="single"
          collapsible
          className="w-full"
          disabled={isChatGpt}
        >
          <AccordionItem value="sampling">
            <AccordionTrigger>
              <Trans>Show sampling controls</Trans>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SettingsField label={<Trans>Top P</Trans>}>
                  <NumberInput
                    min={0}
                    max={1}
                    step={0.01}
                    value={topP ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Top P`}
                    onValueCommit={(val) => setTopP(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Top K</Trans>}>
                  <NumberInput
                    min={1}
                    step={1}
                    value={topK ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Top K`}
                    onValueCommit={(val) => setTopK(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Frequency penalty</Trans>}>
                  <NumberInput
                    min={-2}
                    max={2}
                    step={0.1}
                    value={frequencyPenalty ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Frequency penalty`}
                    onValueCommit={(val) => setFrequencyPenalty(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Presence penalty</Trans>}>
                  <NumberInput
                    min={-2}
                    max={2}
                    step={0.1}
                    value={presencePenalty ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Presence penalty`}
                    onValueCommit={(val) => setPresencePenalty(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Repetition penalty</Trans>}>
                  <NumberInput
                    min={0}
                    max={10}
                    step={0.1}
                    value={repetitionPenalty ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Repetition penalty`}
                    onValueCommit={(val) => setRepetitionPenalty(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Min P</Trans>}>
                  <NumberInput
                    min={0}
                    max={1}
                    step={0.01}
                    value={minP ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Min P`}
                    onValueCommit={(val) => setMinP(val)}
                  />
                </SettingsField>

                <SettingsField label={<Trans>Top A</Trans>}>
                  <NumberInput
                    min={0}
                    max={1}
                    step={0.01}
                    value={topA ?? null}
                    allowNull
                    placeholder={t`Provider default`}
                    aria-label={t`Top A`}
                    onValueCommit={(val) => setTopA(val)}
                  />
                </SettingsField>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SettingsPanel>

      <div className="flex justify-end">
        <Button variant="destructive" onClick={setToDefault}>
          <Trans>Reset generation settings</Trans>
        </Button>
      </div>
    </SettingsStack>
  );
}
