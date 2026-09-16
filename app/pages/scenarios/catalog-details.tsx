import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { PlayIcon, VenetianMask } from "lucide-react";

import placeholderImage from "@/assets/scen-ph.png";
import {
  PublishScenarioDialog,
  ScenarioBreadcrumb,
  ScenarioDetailsLayout,
} from "@/components/scenario";
import { ScenarioStartWizard } from "@/components/scenario/ScenarioStartWizard";
import { CatalogTags } from "@/components/catalog/CatalogTags";
import {
  catalogBrowseSearch,
  readCatalogBrowseSearch,
} from "@/lib/catalog-browse";
import { Button } from "@/components/ui/button";
import {
  useCatalogActions,
  useCatalogClient,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import { useLoadTale } from "@/hooks/useGameSaves";
import { formatExactDateTime } from "@/lib/utils";
import {
  analyzeScenarioQuestions,
  type ScenarioAnswers,
  type ScenarioQuestion,
} from "@/lib/scenario-questions";
import { canSyncNewTales } from "@/services/new-tale-sync";
import { getScenarioById } from "@/services/scenario.service";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import type { Scenario } from "@/types/context.type";
import type {
  CatalogOwnedScenarioDetail,
  CatalogScenarioDetail,
} from "@/types/catalog.type";

type CatalogDetail = CatalogScenarioDetail | CatalogOwnedScenarioDetail;
type CatalogStart = {
  sourceKey: string;
  scenarioSnapshot: CatalogDetail;
  questions: ScenarioQuestion[];
  syncPolicy?: "default" | "private";
  revision: number;
  notice?: string;
};

function catalogAssetUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return placeholderImage;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}

function ownedScenario(
  scenario: CatalogDetail | null,
): scenario is CatalogOwnedScenarioDetail {
  return Boolean(scenario && "moderation" in scenario);
}

function hiddenByModeration(
  scenario: CatalogDetail | null,
): scenario is CatalogOwnedScenarioDetail {
  return (
    ownedScenario(scenario) &&
    scenario.status === "hidden" &&
    scenario.moderation.status === "rejected"
  );
}

function awaitingModeration(
  scenario: CatalogDetail | null,
): scenario is CatalogOwnedScenarioDetail {
  return (
    ownedScenario(scenario) && scenario.moderation.status === "needs_review"
  );
}

function formatDateOnly(dateInput: Date | string | number) {
  return formatExactDateTime(dateInput, undefined, {
    hour: undefined,
    minute: undefined,
  });
}

export default function ScenarioCatalogDetails() {
  const { t } = useLingui();
  const { id } = useParams({ from: "/scenarios/catalog/$id" });
  const navigate = useNavigate();
  const catalog = useCatalogClient();
  const { view, viewOwned, start, publish } = useCatalogActions(catalog);
  const publishLinks = useScenarioPublishLinks();
  const { load: loadTale } = useLoadTale();
  const { search: routeSearch } = useLocation();
  const owned = String(routeSearch.owned) === "1";
  const browse = readCatalogBrowseSearch(
    routeSearch,
    owned ? "published" : "discover",
  );
  const returnSearch = catalogBrowseSearch({
    ...browse,
    tab: owned ? "published" : "discover",
  });
  const sourceKey = JSON.stringify([catalog.baseUrl, id, owned]);
  const currentSource = useRef(sourceKey);
  currentSource.current = sourceKey;
  const [loadedScenario, setLoadedScenario] = useState<{
    sourceKey: string;
    detail: CatalogDetail;
  } | null>(null);
  const scenario =
    loadedScenario?.sourceKey === sourceKey ? loadedScenario.detail : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [canStartPrivate, setCanStartPrivate] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const [pendingStart, setPendingStart] = useState<CatalogStart | null>(null);
  const [starting, setStarting] = useState(false);
  const startLock = useRef(false);
  const startRevision = useRef(0);
  const localLink = useMemo(
    () => publishLinks.links.find((link) => link.catalogScenarioId === id),
    [id, publishLinks.links],
  );
  const dateMs = scenario
    ? Date.parse(scenario.publishedAt ?? scenario.updatedAt)
    : 0;
  const validDateMs = Number.isNaN(dateMs) ? 0 : dateMs;
  const isModerationHidden = hiddenByModeration(scenario);
  const isAwaitingModeration = awaitingModeration(scenario);
  const isModerationUnavailable = isModerationHidden || isAwaitingModeration;
  const moderationReason = isModerationUnavailable
    ? scenario.moderation.reason
    : null;
  const publishedLabel = scenario?.publishedAt
    ? formatDateOnly(scenario.publishedAt)
    : formatDateOnly(validDateMs);
  const updatedLabel = scenario ? formatDateOnly(scenario.updatedAt) : "";
  const startsLabel =
    scenario?.startCount === 1
      ? t`1 start`
      : t`${scenario?.startCount ?? 0} starts`;
  const sourceLabel = owned ? t`Published` : t`Discover`;

  useEffect(() => setPendingStart(null), [sourceKey]);

  useEffect(() => {
    let cancelled = false;
    if (!catalog.enabled) return;
    setLoading(true);
    setError(null);
    void (owned ? viewOwned(id) : view(id))
      .then((detail) => {
        if (!cancelled) setLoadedScenario({ sourceKey, detail });
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
  }, [catalog.enabled, id, owned, sourceKey, view, viewOwned]);

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

  const goBack = () => {
    navigate({
      to: "/scenarios",
      search: returnSearch,
    });
  };

  const completeStart = async (
    setup: CatalogStart,
    answers: ScenarioAnswers = {},
  ) => {
    if (startLock.current || setup.sourceKey !== currentSource.current) return;
    startLock.current = true;
    setStarting(true);
    try {
      const taleId = await start(setup.scenarioSnapshot.id, setup.syncPolicy, {
        answers,
        scenarioSnapshot: setup.scenarioSnapshot,
        expectedVersionId: setup.scenarioSnapshot.currentVersionId ?? undefined,
      });
      if (setup.sourceKey !== currentSource.current) return;
      await loadTale(taleId);
      if (setup.sourceKey !== currentSource.current) return;
      await navigate({ to: "/play" });
    } catch (cause) {
      if (setup.sourceKey !== currentSource.current) return;
      if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "scenario_version_changed"
      ) {
        const latest = await (owned
          ? viewOwned(setup.scenarioSnapshot.id)
          : view(setup.scenarioSnapshot.id));
        if (setup.sourceKey !== currentSource.current) return;
        setLoadedScenario({ sourceKey: setup.sourceKey, detail: latest });
        const { questions, diagnostics } = analyzeScenarioQuestions(
          latest.package.scenario.content,
        );
        if (diagnostics.length > 0) {
          setPendingStart(null);
          toast.error(
            t`This scenario has invalid questions. Its creator needs to fix them before you can start.`,
          );
          return;
        }
        setPendingStart({
          sourceKey: setup.sourceKey,
          scenarioSnapshot: structuredClone(latest),
          questions,
          syncPolicy: setup.syncPolicy,
          revision: ++startRevision.current,
          notice: t`This scenario has changed. Please answer its questions again.`,
        });
        return;
      }
      throw cause;
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  };

  const startScenario = async (syncPolicy?: "default" | "private") => {
    if (!scenario || startLock.current) return;
    const scenarioSnapshot = structuredClone(scenario);
    const { questions, diagnostics } = analyzeScenarioQuestions(
      scenarioSnapshot.package.scenario.content,
    );
    if (diagnostics.length > 0) {
      toast.error(
        t`This scenario has invalid questions. Its creator needs to fix them before you can start.`,
      );
      return;
    }
    const setup = {
      sourceKey,
      scenarioSnapshot,
      questions,
      syncPolicy,
      revision: ++startRevision.current,
    };
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

  const openPublishUpdate = async () => {
    if (!localLink) return;
    const localScenario = await getScenarioById(localLink.localScenarioId);
    if (!localScenario) {
      toast.error(t`Local scenario not found`);
      return;
    }
    setPendingPublish(localScenario);
  };

  const notice = isModerationHidden ? (
    <div className="rounded-xs border border-border bg-muted/20 p-3 text-sm">
      <div className="font-medium">
        <Trans>Hidden by moderation</Trans>
      </div>
      {moderationReason ? (
        <p className="mt-1 text-muted-foreground">{moderationReason}</p>
      ) : null}
    </div>
  ) : isAwaitingModeration ? (
    <div className="rounded-xs border border-border bg-muted/20 p-3 text-sm">
      <div className="font-medium">
        <Trans>Awaiting moderation</Trans>
      </div>
      <p className="mt-1 text-muted-foreground">
        <Trans>This version stays private until it is approved.</Trans>
      </p>
      {moderationReason ? (
        <p className="mt-1 text-muted-foreground">{moderationReason}</p>
      ) : null}
    </div>
  ) : null;

  if (pendingStart?.sourceKey === sourceKey) {
    return (
      <ScenarioStartWizard
        key={pendingStart.revision}
        title={pendingStart.scenarioSnapshot.title}
        questions={pendingStart.questions}
        notice={pendingStart.notice}
        onComplete={(answers) => completeStart(pendingStart, answers)}
        onCancel={() => setPendingStart(null)}
      />
    );
  }

  return (
    <>
      {loading ? (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 text-base text-muted-foreground sm:px-5 lg:px-6">
          <Trans>Loading...</Trans>
        </div>
      ) : null}
      {error ? (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 text-base text-destructive sm:px-5 lg:px-6">
          <Trans>Failed to load scenario.</Trans>
        </div>
      ) : null}
      {scenario ? (
        <ScenarioDetailsLayout
          breadcrumb={
            <ScenarioBreadcrumb
              to="/scenarios"
              search={returnSearch}
              parent={sourceLabel}
              current={<Trans>Scenario</Trans>}
            />
          }
          title={scenario.title}
          imageSrc={catalogAssetUrl(
            catalog.baseUrl,
            scenario.thumbnail?.downloadUrl,
          )}
          imageAlt={t`${scenario.title} thumbnail`}
          byline={
            <>
              <Trans>by</Trans>{" "}
              <span className="text-primary">
                {scenario.author.displayName}
              </span>
            </>
          }
          meta={
            <>
              <span>
                <Trans>Published</Trans> {publishedLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span>{startsLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                <Trans>Updated</Trans> {updatedLabel}
              </span>
            </>
          }
          tags={
            <CatalogTags
              tags={scenario.tags}
              limit={8}
              onSelect={(tag) =>
                navigate({
                  to: "/scenarios",
                  search: catalogBrowseSearch({
                    tab: "discover",
                    q: "",
                    tag: [tag],
                    sort: "newest",
                  }),
                })
              }
            />
          }
          notice={notice}
          actions={
            isModerationUnavailable ? (
              localLink ? (
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: `/scenarios/${localLink.localScenarioId}/edit`,
                      })
                    }
                  >
                    <Trans>Edit local scenario</Trans>
                  </Button>
                  <Button onClick={() => void openPublishUpdate()}>
                    <Trans>Publish update</Trans>
                  </Button>
                </div>
              ) : (
                <></>
              )
            ) : (
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
            )
          }
          summary={scenario.summary}
          backLabel={t`Back to scenarios`}
          onBack={goBack}
        />
      ) : null}
      <PublishScenarioDialog
        open={Boolean(pendingPublish)}
        scenario={pendingPublish}
        updating
        thumbnailUploads={catalog.thumbnailUploads}
        catalog={catalog}
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        onPublish={async ({ metadata, thumbnailFile, policyAcceptance }) => {
          if (!pendingPublish) return;
          try {
            const updated = await publish({
              scenario: pendingPublish,
              metadata,
              thumbnailFile,
              policyAcceptance,
            });
            setLoadedScenario({ sourceKey, detail: updated });
            await publishLinks.refresh();
            toast.success(
              updated.moderation.status === "needs_review"
                ? t`Scenario submitted for moderation`
                : t`Scenario update published`,
            );
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
    </>
  );
}
