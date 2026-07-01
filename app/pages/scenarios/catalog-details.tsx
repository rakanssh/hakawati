import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, PlayIcon, VenetianMask } from "lucide-react";

import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PublishScenarioDialog } from "@/components/scenario";
import {
  useCatalogActions,
  useCatalogClient,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import { useLoadTale } from "@/hooks/useGameSaves";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import { canSyncNewTales } from "@/services/new-tale-sync";
import { getScenarioById } from "@/services/scenario.service";
import { formatExactDateTime, formatRelativeTime } from "@/lib/utils";
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
  const moderationReason = isModerationHidden
    ? scenario.moderation.reason
    : null;
  const visibleTags = scenario?.tags.slice(0, 8) ?? [];
  const hiddenTagCount = scenario
    ? Math.max(0, scenario.tags.length - visibleTags.length)
    : 0;
  const publishedLabel = scenario?.publishedAt
    ? formatDateOnly(scenario.publishedAt)
    : formatDateOnly(validDateMs);
  const updatedLabel = scenario ? formatRelativeTime(scenario.updatedAt) : "";
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
      .catch((err) => {
        if (!cancelled) setError(err);
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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t`Failed to start scenario`,
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

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={goBack}>
          <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="text-sm text-muted-foreground">
          <span className="text-primary">{sourceLabel}</span>
          <span className="px-2">/</span>
          <span>
            <Trans>Scenario</Trans>
          </span>
        </div>
      </div>
      <Separator />
      {loading ? (
        <div className="text-sm text-muted-foreground">
          <Trans>Loading...</Trans>
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-destructive">
          <Trans>Failed to load scenario.</Trans>
        </div>
      ) : null}
      {scenario ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[minmax(18rem,30rem)_minmax(0,1fr)] lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="relative overflow-hidden rounded-xs border">
                <img
                  src={catalogAssetUrl(
                    catalog.baseUrl,
                    scenario.thumbnail?.downloadUrl,
                  )}
                  alt={t`${scenario.title} thumbnail`}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            </div>
            <div className="order-1 grid gap-4 lg:order-2">
              <div className="grid gap-1">
                <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  {scenario.title}
                </h1>
                <p className="text-sm text-muted-foreground">
                  <Trans>by</Trans>{" "}
                  <span className="text-primary">
                    {scenario.author.displayName}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <Trans>Published</Trans> {publishedLabel}
                </span>
                <span aria-hidden="true">-</span>
                <span>{startsLabel}</span>
                <span aria-hidden="true">-</span>
                <span>
                  <Trans>Updated</Trans> {updatedLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleTags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
                {hiddenTagCount ? (
                  <Badge variant="outline">+{hiddenTagCount}</Badge>
                ) : null}
              </div>
              {isModerationHidden ? (
                <div className="rounded-xs border border-border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">
                    <Trans>Hidden by moderation</Trans>
                  </div>
                  {moderationReason ? (
                    <p className="mt-1 text-muted-foreground">
                      {moderationReason}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isModerationHidden ? (
                localLink ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate({
                          to: `/scenarios/${localLink.localScenarioId}`,
                        })
                      }
                    >
                      <Trans>Edit local scenario</Trans>
                    </Button>
                    <Button onClick={() => void openPublishUpdate()}>
                      <Trans>Publish update</Trans>
                    </Button>
                  </div>
                ) : null
              ) : (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)]">
                  <Button onClick={() => void startScenario()}>
                    <PlayIcon className="h-4 w-4" />
                    <Trans>Start Tale</Trans>
                  </Button>
                  {canStartPrivate ? (
                    <Button
                      variant="outline"
                      onClick={() => void startScenario("private")}
                    >
                      <VenetianMask className="h-4 w-4" />
                      <Trans>Start Local</Trans>
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h2 className="text-xl font-semibold">
              <Trans>Summary</Trans>
            </h2>
            <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {scenario.summary}
            </p>
          </section>
        </>
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
        onPublish={async ({ metadata, thumbnailFile }) => {
          if (!pendingPublish) return;
          try {
            const updated = await publish({
              scenario: pendingPublish,
              metadata,
              thumbnailFile,
            });
            setScenario(updated);
            await publishLinks.refresh();
            toast.success(t`Scenario update published`);
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : t`Failed to publish scenario`,
            );
            throw err;
          }
        }}
      />
    </div>
  );
}
