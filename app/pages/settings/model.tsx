import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ApiType } from "@/types";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DicesIcon, InfoIcon } from "lucide-react";

export default function SettingsModel() {
  const navigate = useNavigate();
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
  } = useSettingsStore();

  useEffect(() => {
    // Replace the history entry so switching tabs doesn't build up history
    navigate(".", { replace: true });
  }, [navigate]);

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
          <Input
            type="number"
            min={1}
            max={Math.max(1, modelContextLength || 1)}
            step={1}
            value={contextWindow}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) setContextWindow(val);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>
            Max Output Tokens (1 -{" "}
            {Intl.NumberFormat().format(modelContextLength)})
          </Label>
          <Input
            type="number"
            min={1}
            max={Math.max(1, modelContextLength || 1)}
            step={1}
            value={maxTokens}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) setMaxTokens(val);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Temperature (0 – 2.0)</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setTemperature(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top P (0 – 1.0)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={topP ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setTopP(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top K (≥ 1.0)</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={topK ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) setTopK(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Frequency penalty (-2.0 – 2.0)</Label>
          <Input
            type="number"
            min={-2}
            max={2}
            step={0.1}
            value={frequencyPenalty ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setFrequencyPenalty(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Presence penalty (-2.0 – 2.0)</Label>
          <Input
            type="number"
            min={-2}
            max={2}
            step={0.1}
            value={presencePenalty ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setPresencePenalty(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Repetition penalty (0 – 10.0)</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={repetitionPenalty ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setRepetitionPenalty(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Min P (0 – 1.0)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={minP ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setMinP(val);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Top A (0 – 1.0)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={topA ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) setTopA(val);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Seed</Label>
        <div className="flex gap-2 items-center justify-between">
          <Input
            type="number"
            min={0}
            step={1}
            value={seed}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) setSeed(val);
            }}
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
    </div>
  );
}
