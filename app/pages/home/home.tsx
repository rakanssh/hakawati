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
import { useState, useMemo } from "react";
import { SettingsModal } from "@/components/layout/settings";
import { AlertTriangle } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const { apiKey, model, openAiBaseUrl } = useSettingsStore();
  const { name, description, log } = useTaleStore();
  const lastEntry = log.at(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { hasIssues, issues } = useMemo(() => {
    const missing: string[] = [];
    if (!openAiBaseUrl?.trim()) missing.push("API URL");
    if (!apiKey?.trim()) missing.push("API key");
    if (!model) missing.push("Model");
    return { hasIssues: missing.length > 0, issues: missing };
  }, [apiKey, model, openAiBaseUrl]);
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
            <Button
              onClick={() => navigate({ to: "/play" })}
              disabled={log.length === 0}
            >
              Continue
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/tales" })}
            >
              My Tales
            </Button>
            <Button
              variant="outline"
              disabled={!apiKey || !model}
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
              <li>Type an action, the AI continues the story.</li>
              <li>State changes appear under the narration.</li>
              <li>Your health and inventory are displayed on the sidebar.</li>
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
                      OpenAI-Compatible
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Any OpenAI-compatible provider. OpenAi, OpenRouter, etc.
                  </TooltipContent>
                </Tooltip>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab="api"
      />
    </main>
  );
}
