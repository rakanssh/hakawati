import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";
import { useSettingsStore } from "@/store/useSettingsStore";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTaleStore } from "@/store/useTaleStore";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  SettingsModal,
  type SettingsTabId,
} from "@/components/layout/settings";
import { AlertTriangle } from "lucide-react";
import { QuickstartWizard } from "@/components/quickstart";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { useLoadTale } from "@/hooks/useGameSaves";

export default function Home() {
  const navigate = useNavigate();
  const { model, openAiBaseUrl } = useSettingsStore();
  const { name, description, log, id: currentTaleId } = useTaleStore();
  const lastEntry = log.at(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const nonPlayTabs: readonly SettingsTabId[] = ["game", "api", "model"];
  const { lastPlayedTaleId } = useLastPlayedStore();
  const { load } = useLoadTale();
  const hasLoadedRef = useRef(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const { hasIssues, issues } = useMemo(() => {
    const missing: string[] = [];
    if (!openAiBaseUrl?.trim()) missing.push("API URL");
    if (!model) missing.push("Model");
    return { hasIssues: missing.length > 0, issues: missing };
  }, [model, openAiBaseUrl]);

  // Auto-load last played tale on mount
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    if (!lastPlayedTaleId || currentTaleId === lastPlayedTaleId) {
      setIsInitializing(false);
      return;
    }

    load(lastPlayedTaleId)
      .catch((error) => {
        console.error("Failed to auto-load last played tale:", error);
      })
      .finally(() => {
        setIsInitializing(false);
      });
  }, [lastPlayedTaleId, currentTaleId, load]);

  // Show nothing while initializing
  if (isInitializing) {
    return null;
  }
  return (
    <main className="flex flex-col items-center justify-center h-[calc(100vh-2.5rem)] ">
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            {hasIssues && (
              <div className="flex items-center gap-3 rounded-xs border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold leading-tight">
                    Setup required
                  </div>
                  <p className="text-sm">
                    Missing settings: {issues.join(", ")}. Configure your API in
                    Settings.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setSettingsOpen(true)}
                >
                  Open Settings
                </Button>
              </div>
            )}
            {(name || description || log.length > 0) && (
              <div className="border border-accent/50 bg-accent/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold leading-tight">
                    {name || "Untitled"}
                  </div>
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {log.length} {log.length === 1 ? "turn" : "turns"}
                  </Badge>
                </div>
                <div className="mt-1.5">
                  <p className="text-sm text-mutesd-foreground line-clamp-2">
                    {(lastEntry?.text ?? description) || "No description yet."}
                  </p>
                </div>
              </div>
            )}
            {(name || description || log.length > 0) && (
              <Button
                onClick={() => navigate({ to: "/play" })}
                disabled={log.length === 0 || hasIssues}
              >
                Continue
              </Button>
            )}
            <Button
              onClick={() => setQuickstartOpen(true)}
              disabled={hasIssues}
              className="gap-2 bg-primary"
            >
              Quickstart
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/tales" })}
            >
              My Tales
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/scenarios" })}
            >
              Scenarios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Accordion
        type="single"
        collapsible
        className="w-full max-w-xl rounded-none mt-4"
      >
        <AccordionItem value="how">
          <AccordionTrigger>How to play</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Open Settings → set API URL/key and pick a model.</li>
              <li>
                <strong>Quick Start:</strong> Click &quot;Quickstart&quot; to
                jump right in with a guided wizard, or
              </li>
              <li>Go to Scenarios → Create or Import from Clipboard.</li>
              <li>Go to Scenarios → New Tale.</li>
              <li>
                Type actions, the AI continues. Available actions:
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  <li>Do: Act in the story.</li>
                  <li>Say: Speak something out loud.</li>
                  <li>
                    Story: Write a segment of text that the AI will treat as
                    part of the story and continue from.
                  </li>
                  <li>
                    Direct: An out of character note telling teh AI to do
                    something.
                  </li>
                  <li>Continue: Continue the story.</li>
                  <li>
                    Retry: Retry the last message. Can only be done if the last
                    message is by the AI.
                  </li>
                </ul>
              </li>
              <li>
                In Game Master mode, the AI keeps track of stats and inventory.
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="llms">
          <AccordionTrigger>Supported Providers</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-bold underline">
                      OpenAI-compatible
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Works with any OpenAI-compatible API (cloud or local).
                  </TooltipContent>
                </Tooltip>
              </li>
              <li>Examples (cloud): OpenRouter, OpenAI.</li>
              <li>Examples (local): Ollama, LocalAI, LLM Studio.</li>
              <li>Tip: For local servers, enable CORS if needed.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab="api"
        visibleTabs={nonPlayTabs}
      />
      <QuickstartWizard
        open={quickstartOpen}
        onOpenChange={setQuickstartOpen}
      />
    </main>
  );
}
