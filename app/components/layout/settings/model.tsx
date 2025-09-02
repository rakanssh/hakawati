import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store";
import { ApiType } from "@/types";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DicesIcon, InfoIcon } from "lucide-react";

export default function SettingsModel() {
  const {
    apiType,
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

  function resolveApiTypeLabel(apiType: ApiType) {
    if (apiType === ApiType.OPENAI) return "OpenAI";
    return "Borked";
  }

  return (
    <div className="flex flex-col gap-4">
      <Label>{resolveApiTypeLabel(apiType)} Compatible Settings</Label>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>
            Context Window (0 - {Intl.NumberFormat().format(modelContextLength)}
            )
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent>
                Maximum is determined by current model.
              </TooltipContent>
            </Tooltip>
          </Label>
          <NumberInput
            min={1}
            max={Math.max(1, modelContextLength || 1)}
            step={1}
            value={contextWindow}
            onValueCommit={(val) => setContextWindow(val)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>
            Max Output Tokens (1 -{" "}
            {Intl.NumberFormat().format(modelContextLength)})
          </Label>
          <NumberInput
            min={1}
            max={Math.max(1, modelContextLength || 1)}
            step={1}
            value={maxTokens}
            onValueCommit={(val) => setMaxTokens(val)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Temperature (0 – 2.0)</Label>
          <NumberInput
            min={0}
            max={2}
            step={0.1}
            value={temperature ?? undefined}
            onValueCommit={(val) => setTemperature(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top P (0 – 1.0)</Label>
          <NumberInput
            min={0}
            max={1}
            step={0.01}
            value={topP ?? undefined}
            onValueCommit={(val) => setTopP(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top K (≥ 1.0)</Label>
          <NumberInput
            min={1}
            step={1}
            value={topK ?? undefined}
            onValueCommit={(val) => setTopK(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Frequency penalty (-2.0 – 2.0)</Label>
          <NumberInput
            min={-2}
            max={2}
            step={0.1}
            value={frequencyPenalty ?? undefined}
            onValueCommit={(val) => setFrequencyPenalty(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Presence penalty (-2.0 – 2.0)</Label>
          <NumberInput
            min={-2}
            max={2}
            step={0.1}
            value={presencePenalty ?? undefined}
            onValueCommit={(val) => setPresencePenalty(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Repetition penalty (0 – 10.0)</Label>
          <NumberInput
            min={0}
            max={10}
            step={0.1}
            value={repetitionPenalty ?? undefined}
            onValueCommit={(val) => setRepetitionPenalty(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Min P (0 – 1.0)</Label>
          <NumberInput
            min={0}
            max={1}
            step={0.01}
            value={minP ?? undefined}
            onValueCommit={(val) => setMinP(val)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top A (0 – 1.0)</Label>
          <NumberInput
            min={0}
            max={1}
            step={0.01}
            value={topA ?? undefined}
            onValueCommit={(val) => setTopA(val)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Seed</Label>
        <div className="flex gap-2 items-center justify-between">
          <NumberInput
            min={0}
            step={1}
            value={seed}
            onValueCommit={(val) => setSeed(val)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={randomSeed}
          >
            <DicesIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Button variant="destructive" onClick={setToDefault}>
        Reset to default
      </Button>
    </div>
  );
}
