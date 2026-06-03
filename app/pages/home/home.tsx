import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type GlobalSettingsSectionId,
} from "@/components/layout/settings";
import { AlertTriangle, Globe } from "lucide-react";
import { QuickstartWizard } from "@/components/quickstart";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { useLoadTale } from "@/hooks/useGameSaves";
import { WhatsNewModal } from "@/components/layout";
import { useUpdateStore } from "@/store/useUpdateStore";
import { useVersionStore } from "@/store/useVersionStore";
import { getVersion } from "@tauri-apps/api/app";
import { Trans, useLingui } from "@lingui/react/macro";
import { type Locale, LOCALES, loadLocale } from "@/i18n";

export default function Home() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const { model, openAiBaseUrl, language, setLanguage } = useSettingsStore();

  const handleLanguageChange = (value: string) => {
    const locale = value as Locale;
    setLanguage(locale);
    void loadLocale(locale);
  };
  const { name, description, log, id: currentTaleId } = useTaleStore();
  const lastEntry = log.at(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const nonPlayTabs: readonly GlobalSettingsSectionId[] = [
    "appearance",
    "ai-setup",
    "generation",
  ];
  const { lastPlayedTaleId } = useLastPlayedStore();
  const { load } = useLoadTale();
  const hasLoadedRef = useRef(false);

  const pendingChangelogVersion = useUpdateStore(
    (state) => state.pendingChangelogVersion,
  );
  const pendingChangelogNotes = useUpdateStore(
    (state) => state.pendingChangelogNotes,
  );
  const clearPendingChangelog = useUpdateStore(
    (state) => state.clearPendingChangelog,
  );
  const { lastSeenVersion, setLastSeenVersion } = useVersionStore();

  const { hasIssues, issues } = useMemo(() => {
    const missing: string[] = [];
    if (!openAiBaseUrl?.trim()) missing.push("API URL");
    if (!model) missing.push("Model");
    return { hasIssues: missing.length > 0, issues: missing };
  }, [model, openAiBaseUrl]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    if (!lastPlayedTaleId || currentTaleId === lastPlayedTaleId) {
      return;
    }

    load(lastPlayedTaleId).catch((error) => {
      console.error("Failed to auto-load last played tale:", error);
    });
  }, [lastPlayedTaleId, currentTaleId, load]);

  useEffect(() => {
    const checkForWhatsNew = async () => {
      try {
        const currentVersion = await getVersion();

        if (
          pendingChangelogVersion &&
          pendingChangelogNotes &&
          lastSeenVersion !== currentVersion
        ) {
          setWhatsNewOpen(true);
        }
      } catch (error) {
        console.error("Failed to check app version:", error);
      }
    };

    void checkForWhatsNew();
  }, [pendingChangelogVersion, pendingChangelogNotes, lastSeenVersion]);

  const handleWhatsNewClose = async () => {
    try {
      const currentVersion = await getVersion();
      setLastSeenVersion(currentVersion);
      clearPendingChangelog();
      setWhatsNewOpen(false);
    } catch (error) {
      console.error("Failed to update last seen version:", error);
      setWhatsNewOpen(false);
    }
  };
  return (
    <main className="relative flex min-h-full flex-col items-center justify-center">
      <div className="absolute top-4 right-4">
        <Select value={language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-auto gap-2 border-none bg-transparent hover:bg-accent/50 transition-colors">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {Object.entries(LOCALES).map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            {hasIssues && (
              <div className="flex items-center gap-3 rounded-xs border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold leading-tight">
                    <Trans>Setup required</Trans>
                  </div>
                  <p className="text-sm">
                    <Trans>
                      Missing settings: {issues.join(", ")}. Configure your API
                      in Settings.
                    </Trans>
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Trans>Open Settings</Trans>
                </Button>
              </div>
            )}
            {(name || description || log.length > 0) && (
              <div className="border border-accent/50 bg-accent/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold leading-tight">
                    {name || t`Untitled`}
                  </div>
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {log.length} {log.length === 1 ? t`turn` : t`turns`}
                  </Badge>
                </div>
                <div className="mt-1.5">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {(lastEntry?.text ?? description) || t`No description yet.`}
                  </p>
                </div>
              </div>
            )}
            {(name || description || log.length > 0) && (
              <Button
                onClick={() => navigate({ to: "/play" })}
                disabled={log.length === 0 || hasIssues}
              >
                <Trans>Continue</Trans>
              </Button>
            )}
            <Button
              onClick={() => setQuickstartOpen(true)}
              disabled={hasIssues}
              className="gap-2 bg-primary"
            >
              <Trans>Quickstart</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/tales" })}
            >
              <Trans>My Tales</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/scenarios" })}
            >
              <Trans>Scenarios</Trans>
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
          <AccordionTrigger>
            <Trans>How to play</Trans>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>
                <Trans>Open Settings → set API URL/key and pick a model.</Trans>
              </li>
              <li>
                <strong>
                  <Trans>Quick Start:</Trans>
                </strong>{" "}
                <Trans>
                  Click &quot;Quickstart&quot; to jump right in with a guided
                  wizard, or
                </Trans>
              </li>
              <li>
                <Trans>
                  Go to Scenarios → Create or Import from Clipboard.
                </Trans>
              </li>
              <li>
                <Trans>Go to Scenarios → New Tale.</Trans>
              </li>
              <li>
                <Trans>
                  Type actions, the AI continues. Available actions:
                </Trans>
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  <li>
                    <Trans>Do: Act in the story.</Trans>
                  </li>
                  <li>
                    <Trans>Say: Speak something out loud.</Trans>
                  </li>
                  <li>
                    <Trans>
                      Story: Write a segment of text that the AI will treat as
                      part of the story and continue from.
                    </Trans>
                  </li>
                  <li>
                    <Trans>
                      Direct: An out of character note telling the AI to do
                      something.
                    </Trans>
                  </li>
                  <li>
                    <Trans>Continue: Continue the story.</Trans>
                  </li>
                  <li>
                    <Trans>
                      Retry: Retry the last message. Can only be done if the
                      last message is by the AI.
                    </Trans>
                  </li>
                </ul>
              </li>
              <li>
                <Trans>
                  In Game Master mode, the AI keeps track of stats and
                  inventory.
                </Trans>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="llms">
          <AccordionTrigger>
            <Trans>Supported Providers</Trans>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-bold underline">
                      <Trans>OpenAI-compatible</Trans>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Trans>
                      Works with any OpenAI-compatible API (cloud or local).
                    </Trans>
                  </TooltipContent>
                </Tooltip>
              </li>
              <li>
                <Trans>Examples (cloud): OpenRouter, OpenAI.</Trans>
              </li>
              <li>
                <Trans>Examples (local): Ollama, LocalAI, LLM Studio.</Trans>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab="ai-setup"
        visibleTabs={nonPlayTabs}
      />
      <QuickstartWizard
        open={quickstartOpen}
        onOpenChange={setQuickstartOpen}
      />
      {pendingChangelogVersion && pendingChangelogNotes && (
        <WhatsNewModal
          open={whatsNewOpen}
          onOpenChange={handleWhatsNewClose}
          version={pendingChangelogVersion}
          notes={pendingChangelogNotes}
        />
      )}
    </main>
  );
}
