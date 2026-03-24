import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { generateScenario } from "@/services/llm/scenarioGenerator";
import { toast } from "sonner";
import type { Scenario } from "@/types/context.type";
import { Trans, useLingui } from "@lingui/react/macro";

interface GenerateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (scenario: Scenario) => void;
}

export function GenerateScenarioDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateScenarioDialogProps) {
  const { t } = useLingui();
  const [prompt, setPrompt] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const model = useSettingsStore((s) => s.model);

  const canGenerate = Boolean(model) && prompt.trim().length > 0;

  const handleGenerate = React.useCallback(async () => {
    if (!model) {
      toast.error(t`No AI model selected`);
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setIsGenerating(true);
    try {
      const scenario = await generateScenario(
        prompt.trim(),
        model,
        abort.signal,
      );
      onGenerated(scenario);
      onOpenChange(false);
      setPrompt("");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        t`Failed to generate scenario: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [model, prompt, onGenerated, onOpenChange, t]);

  const handleClose = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        abortRef.current?.abort();
        setIsGenerating(false);
        setPrompt("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Generate Scenario</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Describe the scenario you want and your currently selected model
              will be prompted to generate a starter for you.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          disabled={isGenerating}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isGenerating}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            <span className="ml-1">
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trans>Generate</Trans>
              )}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
