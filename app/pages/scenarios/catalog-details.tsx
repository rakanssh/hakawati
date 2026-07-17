import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { PlayIcon, VenetianMask } from "lucide-react";

import placeholderImage from "@/assets/scen-ph.png";
import {
  PublishScenarioDialog,
  ScenarioDetailsLayout,
} from "@/components/scenario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCatalogActions,
  useCatalogClient,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import { useLoadTale } from "@/hooks/useGameSaves";
import { formatExactDateTime } from "@/lib/utils";
import { canSyncNewTales } from "@/services/new-tale-sync";
import { getScenarioById } from "@/services/scenario.service";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import type { Scenario } from "@/types/context.type";
import type {
  CatalogOwnedScenarioDetail,
  CatalogScenarioDetail,
} from "@/types/catalog.type";

type CatalogDetail = CatalogScenarioDetail | CatalogOwnedScenarioDetail;

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
  const owned =
    new URLSearchParams(window.location.search).get("owned") === "1";
  const [scenario, setScenario] = useState<CatalogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [canStartPrivate, setCanStartPrivate] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
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
  const visibleTags = scenario?.tags.slice(0, 8) ?? [];
  const hiddenTagCount = scenario
    ? Math.max(0, scenario.tags.length - visibleTags.length)
    : 0;
  const publishedLabel = scenario?.publishedAt
    ? formatDateOnly(scenario.publishedAt)
    : formatDateOnly(validDateMs);
  const updatedLabel = scenario ? formatDateOnly(scenario.updatedAt) : "";
  const startsLabel =
    scenario?.startCount === 1
      ? t`1 start`
      : t`${scenario?.startCount ?? 0} starts`;
  const sourceLabel = owned ? t`Published` : t`Discover`;

  useEffect(() => {
    let cancelled = false;
    if (!catalog.enabled) return;
    setLoading(true);
    setError(null);
    void (owned ? viewOwned(id) : view(id))
      .then((detail) => {
        if (!cancelled) setScenario(detail);
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
  }, [catalog.enabled, id, owned, view, viewOwned]);

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
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({
      to: owned ? "/scenarios?tab=published" : "/scenarios?tab=discover",
    });
  };

  const startScenario = async (syncPolicy?: "default" | "private") => {
    if (!scenario) return;
    try {
      const taleId = await start(scenario.id, syncPolicy);
      await loadTale(taleId);
      navigate({ to: "/play" });
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
            <>
              <span className="text-primary">{sourceLabel}</span>
              <span className="px-2">/</span>
              <span>
                <Trans>Scenario</Trans>
              </span>
            </>
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
            <>
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {hiddenTagCount ? (
                <Badge variant="outline">+{hiddenTagCount}</Badge>
              ) : null}
            </>
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
                <Button onClick={() => void startScenario()}>
                  <PlayIcon className="size-4" />
                  <Trans>Start Tale</Trans>
                </Button>
                {canStartPrivate ? (
                  <Button
                    variant="outline"
                    onClick={() => void startScenario("private")}
                  >
                    <VenetianMask className="size-4" />
                    <Trans>Start Local</Trans>
                  </Button>
                ) : null}
              </div>
            )
          }
          summaryHeading={<Trans>Summary</Trans>}
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
            setScenario(updated);
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
