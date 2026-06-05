import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GenerateScenarioDialog } from "@/components/scenario";
import {
  SettingsModal,
  type GlobalSettingsSectionId,
} from "@/components/layout/settings";
import { QuickstartWizard } from "@/components/quickstart";
import { WhatsNewModal } from "@/components/layout";
import placeholderImage from "@/assets/scen-ph.png";
import { useLoadTale } from "@/hooks/useGameSaves";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useScenariosList } from "@/hooks/useScenarios";
import { useTalesList } from "@/hooks/useTales";
import { type Locale, LOCALES, loadLocale } from "@/i18n";
import {
  bytesToObjectUrl,
  formatExactDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import { initTaleFromScenario } from "@/services/scenario.service";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import { useVersionStore } from "@/store/useVersionStore";
import type { ScenarioHead } from "@/types/context.type";
import type { TaleHead } from "@/types/tale.type";
import { getVersion } from "@tauri-apps/api/app";
import { useNavigate } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  ChevronRight,
  Globe,
  Loader2,
  Plus,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ShelfProps = {
  title: React.ReactNode;
  action: React.ReactNode;
  children: React.ReactNode;
};

function Shelf({ title, action, children }: ShelfProps) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-normal">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {action}
        </div>
      </div>
      <ScrollArea scrollbars="horizontal" className="w-full">
        <div className="flex snap-x gap-2 px-2 pb-3 sm:px-0 lg:gap-3">
          {children}
        </div>
      </ScrollArea>
    </section>
  );
}

function ShelfState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-28 w-[60vw] max-w-56 shrink-0 snap-start items-center justify-center border border-dashed border-border/80 bg-card/35 p-2.5 text-center text-sm text-muted-foreground sm:min-h-32 sm:w-60 sm:max-w-64 sm:p-3 lg:w-64">
      {children}
    </div>
  );
}

function PreviewImage({
  thumbnail,
  alt,
}: {
  thumbnail?: Uint8Array | null;
  alt: string;
}) {
  return (
    <img
      src={thumbnail ? bytesToObjectUrl(thumbnail) : placeholderImage}
      alt={alt}
      className="h-20 w-full object-cover sm:h-28"
    />
  );
}

function TaleCard({
  tale,
  loading,
  disabled,
  onLoad,
}: {
  tale: TaleHead;
  loading: boolean;
  disabled: boolean;
  onLoad: (id: string) => void;
}) {
  const { t } = useLingui();

  return (
    <Card className="w-[60vw] max-w-56 shrink-0 snap-start gap-0 overflow-hidden py-0 sm:w-60 sm:max-w-64 lg:w-64">
      <CardHeader className="p-0">
        <div className="relative">
          <PreviewImage thumbnail={tale.thumbnail} alt={t`${tale.name} tale`} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="absolute left-2 top-2 bg-background/80 text-foreground backdrop-blur">
                {formatRelativeTime(tale.updatedAt)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <Trans>Last played: {formatExactDateTime(tale.updatedAt)}</Trans>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-28 flex-col gap-1.5 p-2 sm:min-h-32 sm:gap-2 sm:p-2.5">
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 truncate font-semibold">
              {tale.name}
            </h3>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {tale.logCount} {tale.logCount === 1 ? t`turn` : t`turns`}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
            {tale.lastLogEntry?.text ||
              tale.description ||
              t`No description yet.`}
          </p>
        </div>
        <Button
          className="mt-auto w-full"
          onClick={() => onLoad(tale.id)}
          disabled={disabled || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play />}
          <Trans>Load Tale</Trans>
        </Button>
      </CardContent>
    </Card>
  );
}

function ScenarioCard({
  scenario,
  loading,
  disabled,
  onStart,
}: {
  scenario: ScenarioHead;
  loading: boolean;
  disabled: boolean;
  onStart: (id: string) => void;
}) {
  const { t } = useLingui();

  return (
    <Card className="w-[60vw] max-w-56 shrink-0 snap-start gap-0 overflow-hidden py-0 sm:w-60 sm:max-w-64 lg:w-64">
      <CardHeader className="p-0">
        <div className="relative">
          <PreviewImage
            thumbnail={scenario.thumbnail}
            alt={t`${scenario.name} scenario`}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="absolute left-2 top-2 bg-background/80 text-foreground backdrop-blur">
                {formatRelativeTime(scenario.updatedAt)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <Trans>
                Last updated: {formatExactDateTime(scenario.updatedAt)}
              </Trans>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-28 flex-col gap-1.5 p-2 sm:min-h-32 sm:gap-2 sm:p-2.5">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{scenario.name}</h3>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
            {scenario.initialDescription || t`No description yet.`}
          </p>
        </div>
        <Button
          className="mt-auto w-full"
          onClick={() => onStart(scenario.id)}
          disabled={disabled || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play />}
          <Trans>New Tale</Trans>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const narratorConfig = useSettingsStore((state) => state.modelRoles.narrator);
  const utilityConfig = useSettingsStore((state) => state.modelRoles.utility);
  const { name, description, log, id: currentTaleId } = useTaleStore();
  const { isMobilePlatform } = useIsMobile();
  const lastEntry = log.at(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [loadingTaleId, setLoadingTaleId] = useState<string | null>(null);
  const [startingScenarioId, setStartingScenarioId] = useState<string | null>(
    null,
  );
  const nonPlayTabs: readonly GlobalSettingsSectionId[] = [
    "appearance",
    "ai-setup",
    "generation",
  ];
  const { lastPlayedTaleId } = useLastPlayedStore();
  const { load } = useLoadTale();
  const tales = useTalesList(1, 6);
  const scenarios = useScenariosList(1, 6);
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
    if (!narratorConfig.baseUrl?.trim()) missing.push("Narrator API URL");
    if (!narratorConfig.model) missing.push("Narrator model");
    return { hasIssues: missing.length > 0, issues: missing };
  }, [narratorConfig]);

  const utilityReady = isModelRoleConfigured(utilityConfig);

  const hasActiveGame = Boolean(name || description || log.length > 0);
  const canContinue = hasActiveGame && log.length > 0 && !hasIssues;

  const handleLanguageChange = (value: string) => {
    const locale = value as Locale;
    setLanguage(locale);
    void loadLocale(locale);
  };

  const handleLoadTale = async (id: string) => {
    setLoadingTaleId(id);
    try {
      await load(id);
      navigate({ to: "/play" });
    } catch (_error) {
      toast.error(t`Failed to load tales.`);
    } finally {
      setLoadingTaleId(null);
    }
  };

  const handleStartScenario = async (id: string) => {
    setStartingScenarioId(id);
    try {
      const taleId = await initTaleFromScenario(id);
      await load(taleId);
      navigate({ to: "/play" });
    } catch (_error) {
      toast.error(t`Failed to load scenarios.`);
    } finally {
      setStartingScenarioId(null);
    }
  };

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

  const languageControl = (
    <Select value={language} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-auto gap-2 border-none bg-background/50 backdrop-blur transition-colors hover:bg-accent/50">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {Object.entries(LOCALES).map(([code, localeName]) => (
          <SelectItem key={code} value={code}>
            {localeName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <main className="relative min-h-full overflow-x-hidden">
      {!hasIssues && (
        <div className="absolute right-3 top-3 z-20">{languageControl}</div>
      )}

      <div
        className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6"
        style={
          hasActiveGame
            ? {
                paddingBottom: isMobilePlatform
                  ? "calc(7rem + env(safe-area-inset-bottom))"
                  : "5.5rem",
              }
            : undefined
        }
      >
        {hasIssues && <div className="flex justify-end">{languageControl}</div>}

        {hasIssues && (
          <div className="flex flex-col gap-2 border border-destructive/40 bg-destructive/10 p-2.5 text-destructive sm:flex-row sm:items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight">
                <Trans>Setup required</Trans>
              </div>
              <p className="text-sm">
                <Trans>
                  Missing settings: {issues.join(", ")}. Configure your API in
                  Settings.
                </Trans>
              </p>
            </div>
            <Button variant="destructive" onClick={() => setSettingsOpen(true)}>
              <Trans>Open Settings</Trans>
            </Button>
          </div>
        )}

        <div className={`flex flex-col gap-5 ${hasIssues ? "" : "pt-12"}`}>
          <Shelf
            title={<Trans>Latest Tales</Trans>}
            action={
              <>
                <Button
                  size="sm"
                  onClick={() => setQuickstartOpen(true)}
                  disabled={hasIssues}
                >
                  <Sparkles />
                  <Trans>Quickstart</Trans>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/tales" })}
                >
                  <Trans>View all</Trans>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </>
            }
          >
            {tales.loading && (
              <ShelfState>
                <Trans>Loading…</Trans>
              </ShelfState>
            )}
            {Boolean(tales.error) && (
              <ShelfState>
                <Trans>Failed to load tales.</Trans>
              </ShelfState>
            )}
            {!tales.loading && !tales.error && tales.items.length === 0 && (
              <ShelfState>
                <Trans>No tales yet.</Trans>
              </ShelfState>
            )}
            {tales.items.map((tale) => (
              <TaleCard
                key={tale.id}
                tale={tale}
                loading={loadingTaleId === tale.id}
                disabled={hasIssues}
                onLoad={handleLoadTale}
              />
            ))}
          </Shelf>

          <Shelf
            title={<Trans>Latest Scenarios</Trans>}
            action={
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" aria-label={t`Create Scenario`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => navigate({ to: "/scenarios/new" })}
                    >
                      <Plus className="h-4 w-4" />
                      <Trans>New scenario</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!utilityReady}
                      onClick={() => setGenerateOpen(true)}
                    >
                      <WandSparkles className="h-4 w-4" />
                      <Trans>Generate Scenario</Trans>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/scenarios" })}
                >
                  <Trans>View all</Trans>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </>
            }
          >
            {scenarios.loading && (
              <ShelfState>
                <Trans>Loading…</Trans>
              </ShelfState>
            )}
            {Boolean(scenarios.error) && (
              <ShelfState>
                <Trans>Failed to load scenarios.</Trans>
              </ShelfState>
            )}
            {!scenarios.loading &&
              !scenarios.error &&
              scenarios.items.length === 0 && (
                <ShelfState>
                  <Trans>No scenarios yet.</Trans>
                </ShelfState>
              )}
            {scenarios.items.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                loading={startingScenarioId === scenario.id}
                disabled={hasIssues}
                onStart={handleStartScenario}
              />
            ))}
          </Shelf>
        </div>

        <Accordion type="single" collapsible className="rounded-none">
          <AccordionItem value="how">
            <AccordionTrigger>
              <Trans>How to play</Trans>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                <li>
                  <Trans>
                    Open Settings → set API URL/key and pick a model.
                  </Trans>
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
                  <ul className="list-disc space-y-1 pl-4 text-sm">
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
        </Accordion>
      </div>

      {hasActiveGame && (
        <div
          className="fixed inset-x-0 z-30 border-t border-primary/60 bg-card"
          style={{
            bottom: isMobilePlatform
              ? "calc(3.5rem + env(safe-area-inset-bottom))"
              : 0,
          }}
        >
          <div className="h-0.5 bg-primary" />
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 lg:px-6">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 truncate font-semibold">
                  {name || t`Untitled`}
                </h2>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {log.length} {log.length === 1 ? t`turn` : t`turns`}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {(lastEntry?.text ?? description) || t`No description yet.`}
              </p>
            </div>
            <Button
              className="h-9 w-full sm:w-auto sm:min-w-36"
              onClick={() => navigate({ to: "/play" })}
              disabled={!canContinue}
            >
              <Play />
              <Trans>Continue</Trans>
            </Button>
          </div>
        </div>
      )}

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
      <GenerateScenarioDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={(scenario) => {
          navigate({
            to: "/scenarios/new",
            state: (prev) => ({
              ...(prev ?? {}),
              importedScenario: scenario,
            }),
          });
        }}
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
