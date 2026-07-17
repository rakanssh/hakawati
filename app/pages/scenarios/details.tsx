import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import { PencilIcon, PlayIcon, VenetianMask } from "lucide-react";
import { toast } from "sonner";

import placeholderImage from "@/assets/scen-ph.png";
import { ScenarioDetailsLayout } from "@/components/scenario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLoadTale } from "@/hooks/useGameSaves";
import { bytesToObjectUrl, formatExactDateTime } from "@/lib/utils";
import { canSyncNewTales } from "@/services/new-tale-sync";
import {
  getScenarioById,
  getScenarioHeadById,
  initTaleFromScenario,
} from "@/services/scenario.service";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import { GameMode, type Scenario } from "@/types/context.type";

export default function ScenarioDetails() {
  const { id } = useParams({ from: "/scenarios/$id" });
  const navigate = useNavigate();
  const { t } = useLingui();
  const { load: loadTale } = useLoadTale();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const [canStartPrivate, setCanStartPrivate] = useState(false);

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

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: "/scenarios" });
  };

  const startScenario = async (syncPolicy?: "default" | "private") => {
    setStarting(true);
    try {
      const taleId = await initTaleFromScenario(id, { syncPolicy });
      await loadTale(taleId);
      navigate({ to: "/play" });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t`Failed to start scenario`,
      );
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
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
        <>
          <span className="text-primary">
            <Trans>Your scenarios</Trans>
          </span>
          <span className="px-2">/</span>
          <span>
            <Trans>Details</Trans>
          </span>
        </>
      }
      title={scenario.name}
      imageSrc={imageSrc}
      imageAlt={t`${scenario.name} thumbnail`}
      headerAction={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: `/scenarios/${id}/edit` })}
        >
          <PencilIcon className="size-4" />
          <Trans>Edit</Trans>
        </Button>
      }
      meta={
        <>
          <span>{gameModeLabel}</span>
          {updatedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <Trans>Updated</Trans> {formatExactDateTime(updatedAt)}
              </span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>
            <Trans>{contentCounts.storyCards} story cards</Trans>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <Trans>{contentCounts.promptComponents} prompt sections</Trans>
          </span>
        </>
      }
      tags={
        contentCounts.gameElements > 0 ? (
          <Badge variant="outline">
            <Trans>{contentCounts.gameElements} game elements</Trans>
          </Badge>
        ) : null
      }
      actions={
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button disabled={starting} onClick={() => void startScenario()}>
            <PlayIcon className="size-4" />
            <Trans>Start Tale</Trans>
          </Button>
          {canStartPrivate ? (
            <Button
              variant="outline"
              disabled={starting}
              onClick={() => void startScenario("private")}
            >
              <VenetianMask className="size-4" />
              <Trans>Start Local</Trans>
            </Button>
          ) : null}
        </div>
      }
      summaryHeading={<Trans>Summary</Trans>}
      summary={scenario.description || <Trans>No description yet.</Trans>}
      backLabel={t`Back to scenarios`}
      onBack={goBack}
    />
  );
}
