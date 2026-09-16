import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  BookOpenIcon,
  PencilIcon,
  PlayIcon,
  UploadCloudIcon,
  VenetianMask,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import placeholderImage from "@/assets/scen-ph.png";
import {
  PublishScenarioDialog,
  ScenarioBreadcrumb,
  ScenarioDetailsLayout,
} from "@/components/scenario";
import { ScenarioStartWizard } from "@/components/scenario/ScenarioStartWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLoadTale } from "@/hooks/useGameSaves";
import {
  useCatalogActions,
  useCatalogClient,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import { bytesToObjectUrl, formatExactDateTime } from "@/lib/utils";
import { scenarioContentToTaleSeed } from "@/lib/scenario-content";
import {
  analyzeScenarioQuestions,
  previewScenarioText,
  type ScenarioAnswers,
  type ScenarioQuestion,
} from "@/lib/scenario-questions";
import { canSyncNewTales } from "@/services/new-tale-sync";
import {
  getScenarioById,
  getScenarioHeadById,
  initTaleFromScenario,
} from "@/services/scenario.service";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import { useSettingsStore } from "@/store";
import { GameMode, type Scenario } from "@/types/context.type";

type ScenarioStart = {
  scenarioSnapshot: Scenario;
  questions: ScenarioQuestion[];
  syncPolicy?: "default" | "private";
};

export default function ScenarioDetails() {
  const { id } = useParams({ from: "/scenarios/$id" });
  const navigate = useNavigate();
  const { t } = useLingui();
  const { load: loadTale } = useLoadTale();
  const catalog = useCatalogClient();
  const catalogActions = useCatalogActions(catalog);
  const publishLinks = useScenarioPublishLinks();
  const canPublish = catalog.enabled && catalog.signedIn;
  const isPublished = publishLinks.links.some(
    (link) => link.localScenarioId === id,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const fontSize = useSettingsStore((state) => state.fontSize);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const startLock = useRef(false);
  const currentId = useRef(id);
  currentId.current = id;
  const [pendingStart, setPendingStart] = useState<ScenarioStart | null>(null);
  const [canStartPrivate, setCanStartPrivate] = useState(false);

  useEffect(() => setPendingStart(null), [id]);
  useEffect(() => setPublishOpen(false), [id, canPublish]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([getScenarioById(id), getScenarioHeadById(id)])
      .then(([result, head]) => {
        if (cancelled) return;
        if (!result) throw new Error(t`Scenario not found`);
        setScenario(result);
        setUpdatedAt(head?.updatedAt ?? null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  useEffect(() => {
    let disposed = false;
    const refreshPrivateStart = () => {
      canSyncNewTales().then((canSync) => {
        if (!disposed) setCanStartPrivate(canSync);
      });
    };

    refreshPrivateStart();
    const removeListener = addSyncChangedListener(refreshPrivateStart);
    return () => {
      disposed = true;
      removeListener();
    };
  }, []);

  const imageSrc = useMemo(
    () =>
      scenario?.thumbnail
        ? bytesToObjectUrl(scenario.thumbnail)
        : placeholderImage,
    [scenario?.thumbnail],
  );

  const contentCounts = useMemo(() => {
    const counts = {
      storyCards: 0,
      promptComponents: 0,
      gameElements: 0,
    };
    for (const item of scenario?.content ?? []) {
      if (item.type === "story_card") counts.storyCards += 1;
      else if (item.type === "prompt_component") counts.promptComponents += 1;
      else counts.gameElements += 1;
    }
    return counts;
  }, [scenario?.content]);

  const openingText = useMemo(
    () =>
      scenario
        ? previewScenarioText(
            scenarioContentToTaleSeed(scenario.content).openingText,
          )
        : "",
    [scenario],
  );

  const goBack = () => {
    navigate({ to: "/scenarios" });
  };

  const completeStart = async (
    setup: ScenarioStart,
    answers: ScenarioAnswers = {},
  ) => {
    if (startLock.current || setup.scenarioSnapshot.id !== currentId.current)
      return;
    startLock.current = true;
    setStarting(true);
    try {
      const taleId = await initTaleFromScenario(setup.scenarioSnapshot.id, {
        syncPolicy: setup.syncPolicy,
        answers,
        scenarioSnapshot: setup.scenarioSnapshot,
      });
      if (setup.scenarioSnapshot.id !== currentId.current) return;
      await loadTale(taleId);
      if (setup.scenarioSnapshot.id !== currentId.current) return;
      await navigate({ to: "/play" });
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  };

  const startScenario = async (syncPolicy?: "default" | "private") => {
    if (!scenario || scenario.id !== id || startLock.current) return;
    const scenarioSnapshot = structuredClone(scenario);
    const { questions, diagnostics } = analyzeScenarioQuestions(
      scenarioSnapshot.content,
    );
    if (diagnostics.length > 0) {
      toast.error(
        t`This scenario has invalid questions. Edit the scenario before starting.`,
      );
      return;
    }
    const setup = { scenarioSnapshot, questions, syncPolicy };
    if (questions.length > 0) {
      setPendingStart(setup);
      return;
    }
    try {
      await completeStart(setup);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t`Failed to start scenario`,
      );
    }
  };

  if (pendingStart && pendingStart.scenarioSnapshot.id === id) {
    return (
      <ScenarioStartWizard
        title={pendingStart.scenarioSnapshot.name}
        questions={pendingStart.questions}
        onComplete={(answers) => completeStart(pendingStart, answers)}
        onCancel={() => setPendingStart(null)}
      />
    );
  }

  if (loading || (!error && scenario && scenario.id !== id)) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-6 text-base text-muted-foreground sm:px-5 lg:px-6">
        <Trans>Loading...</Trans>
      </div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-6 sm:px-5 lg:px-6">
        <p className="text-base text-destructive">
          <Trans>Failed to load scenario.</Trans>
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/scenarios" })}
        >
          <Trans>Back to scenarios</Trans>
        </Button>
      </div>
    );
  }

  const gameModeLabel =
    scenario.initialGameMode === GameMode.GM ? t`Game Master` : t`Story Teller`;

  return (
    <ScenarioDetailsLayout
      breadcrumb={
        <ScenarioBreadcrumb
          to="/scenarios"
          parent={<Trans>Your scenarios</Trans>}
          current={<Trans>Details</Trans>}
        />
      }
      title={scenario.name}
      imageSrc={imageSrc}
      imageAlt={t`${scenario.name} thumbnail`}
      headerAction={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: `/scenarios/${id}/edit` })}
          >
            <PencilIcon className="size-4" />
            <Trans>Edit</Trans>
          </Button>
          {canPublish && (
            <Button
              variant="outline"
              size="sm"
              disabled={!catalog.publishingEnabled}
              onClick={() => setPublishOpen(true)}
            >
              <UploadCloudIcon className="size-4" />
              {isPublished ? (
                <Trans>Publish update</Trans>
              ) : (
                <Trans>Publish</Trans>
              )}
            </Button>
          )}
        </div>
      }
      meta={
        <>
          <span>
            <Trans>{contentCounts.storyCards} story cards</Trans>
          </span>
          <span>
            <Trans>{contentCounts.promptComponents} prompt sections</Trans>
          </span>
          {contentCounts.gameElements > 0 ? (
            <span>
              <Trans>{contentCounts.gameElements} game elements</Trans>
            </span>
          ) : null}
          {updatedAt ? (
            <span>
              <Trans>Updated</Trans> {formatExactDateTime(updatedAt)}
            </span>
          ) : null}
        </>
      }
      tags={<Badge variant="secondary">{gameModeLabel}</Badge>}
      actions={
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button
            size="lg"
            disabled={starting}
            onClick={() => void startScenario()}
          >
            <PlayIcon className="size-4" />
            <Trans>Start Tale</Trans>
          </Button>
          {canStartPrivate ? (
            <Button
              variant="outline"
              size="lg"
              disabled={starting}
              onClick={() => void startScenario("private")}
            >
              <VenetianMask className="size-4" />
              <Trans>Start Local</Trans>
            </Button>
          ) : null}
        </div>
      }
      summary={scenario.description || <Trans>No description yet.</Trans>}
      backLabel={t`Back to scenarios`}
      onBack={goBack}
    >
      {openingText ? (
        <section className="grid gap-4 rounded-xs border bg-card/60 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpenIcon className="size-4" aria-hidden="true" />
            <h2 className="text-sm font-medium">
              <Trans>Opening passage</Trans>
            </h2>
          </div>
          <div
            className="max-w-[70ch] break-words leading-[1.8] text-foreground/95 [&_blockquote]:border-s-2 [&_blockquote]:ps-4 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_p+p]:mt-4 [&_ul]:list-disc [&_ul]:ps-6"
            style={{ fontSize: `${fontSize}rem` }}
          >
            <ReactMarkdown
              allowedElements={[
                "p",
                "em",
                "strong",
                "blockquote",
                "br",
                "ul",
                "ol",
                "li",
              ]}
              unwrapDisallowed
              skipHtml
            >
              {openingText}
            </ReactMarkdown>
          </div>
        </section>
      ) : null}
      <PublishScenarioDialog
        open={publishOpen && canPublish}
        scenario={scenario}
        updating={isPublished}
        thumbnailUploads={catalog.thumbnailUploads}
        catalog={catalog}
        onOpenChange={setPublishOpen}
        onPublish={async ({ metadata, thumbnailFile, policyAcceptance }) => {
          try {
            const result = await catalogActions.publish({
              scenario,
              metadata,
              thumbnailFile,
              policyAcceptance,
            });
            toast.success(
              result.moderation.status === "needs_review"
                ? t`Scenario submitted for moderation`
                : isPublished
                  ? t`Scenario update published`
                  : t`Scenario published`,
            );
            setPublishOpen(false);
            await publishLinks.refresh();
          } catch (cause) {
            toast.error(
              cause instanceof Error
                ? cause.message
                : t`Failed to publish scenario`,
            );
            throw cause;
          }
        }}
      />
    </ScenarioDetailsLayout>
  );
}
