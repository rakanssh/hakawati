import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ScenarioBasicsFields } from "@/components/scenario/ScenarioBasicsFields";
import { ScenarioBreadcrumb } from "@/components/scenario/ScenarioBreadcrumb";
import { GameModeField } from "@/components/scenario/GameModeField";
import { StatsEditor } from "@/components/scenario/StatsEditor";
import { InventoryEditor } from "@/components/scenario/InventoryEditor";
import { StorybookEditor } from "@/components/storybook";
import { PromptComponentsEditor } from "@/components/prompt-components/PromptComponentsEditor";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { SCENARIO_COMPONENT_TYPES } from "@/lib/prompt-components";
import { ArrowLeftIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { PublishScenarioDialog } from "@/components/scenario/PublishScenarioDialog";
import {
  useCatalogActions,
  useCatalogClient,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import { prepareScenarioPublishDraft } from "@/services/catalog.service";
import { getScenarioById } from "@/services/scenario.service";
import { markScenarioDraftCoverInitialized } from "@/repositories/scenario-publish-link.repository";
import type { Scenario } from "@/types/context.type";
import {
  ScenarioQuestionErrors,
  ScenarioQuestionsHelp,
} from "@/components/scenario/ScenarioQuestionsHelp";
export default function ScenarioEdit() {
  const { id } = useParams({ from: "/scenarios/$id/edit" });
  const navigate = useNavigate();
  const { t } = useLingui();
  const { scenario, setScenario, save, saving } = useScenarioEditor();
  const catalog = useCatalogClient();
  const catalogActions = useCatalogActions(catalog);
  const publishLinks = useScenarioPublishLinks();
  const transportRef = useRef(catalog.authTransport);
  transportRef.current = catalog.authTransport;
  const currentId = useRef(id);
  currentId.current = id;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coverRecoveryError, setCoverRecoveryError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [coverEdited, setCoverEdited] = useState(false);
  const [readingCover, setReadingCover] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const isPublished = publishLinks.links.some(
    (link) => link.localScenarioId === id,
  );

  const {
    fields,
    addStat,
    updateStat,
    removeStat,
    addInventoryItem,
    updateInventoryItem,
    removeInventoryItem,
    addStoryCard,
    updateStoryCard,
    removeStoryCard,
    addComponent,
    updateComponent,
    removeComponent,
  } = useScenarioForm(scenario, setScenario);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setCoverRecoveryError(false);
    setCoverEdited(false);
    setPendingPublish(null);
    void (async () => {
      const loaded = await getScenarioById(id);
      if (!loaded) throw new Error("Scenario not found");
      let draft = loaded;
      const transport = transportRef.current;
      if (transport) {
        try {
          draft = (await prepareScenarioPublishDraft(loaded, transport))
            .scenario;
        } catch {
          if (!cancelled) setCoverRecoveryError(true);
        }
      }
      if (!cancelled) setScenario(draft);
    })()
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadAttempt, setScenario]);

  const persistDraft = async () => {
    const savedId = await save();
    if (coverEdited) {
      await markScenarioDraftCoverInitialized(savedId);
      if (currentId.current === id) setCoverEdited(false);
    }
    return { ...scenario, id: savedId };
  };

  const handleSave = async () => {
    try {
      await persistDraft();
      if (currentId.current !== id) return;
      await navigate({ to: `/scenarios/${id}` });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to save scenario`,
      );
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: `/scenarios/${id}` })}
            aria-label="Back to scenario details"
          >
            <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          </Button>
          <ScenarioBreadcrumb
            to="/scenarios"
            parent={<Trans>Your scenarios</Trans>}
            current={<Trans>Edit</Trans>}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={saving || readingCover || loading || loadError}
            className="w-full sm:w-auto"
            onClick={async () => {
              await handleSave();
            }}
          >
            <Trans>Save draft</Trans>
          </Button>
          {catalog.enabled && catalog.signedIn && (
            <Button
              disabled={
                saving ||
                readingCover ||
                loading ||
                loadError ||
                !catalog.publishingEnabled
              }
              onClick={async () => {
                try {
                  const draft = await persistDraft();
                  if (currentId.current === id) setPendingPublish(draft);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t`Failed to save scenario`,
                  );
                }
              }}
            >
              {isPublished ? (
                <Trans>Publish update</Trans>
              ) : (
                <Trans>Publish</Trans>
              )}
            </Button>
          )}
        </div>
      </header>
      <Separator />
      {loading ? (
        <p role="status">
          <Trans>Loading scenario...</Trans>
        </p>
      ) : loadError ? (
        <div role="alert" className="flex items-center gap-2">
          <Trans>Scenario could not be loaded.</Trans>
          <Button
            variant="outline"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <fieldset
          disabled={saving}
          className="flex w-full min-w-0 max-w-3xl flex-col gap-4"
        >
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              <Trans>Edit Scenario</Trans>
            </h1>
            <p className="text-base text-muted-foreground">{scenario.name}</p>
            {isPublished && (
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Changes stay in your draft until you publish an update.
                </Trans>
              </p>
            )}
          </div>
          {coverRecoveryError && (
            <p role="alert" className="text-sm text-muted-foreground">
              <Trans>
                Published details could not be loaded. You can edit your draft;
                publishing will retry.
              </Trans>
            </p>
          )}
          <ScenarioBasicsFields
            name={scenario.name}
            thumbnail={scenario.thumbnail}
            description={scenario.description}
            disabled={saving}
            onCoverReadingChange={setReadingCover}
            onNameChange={(name) =>
              setScenario((previous) => ({ ...previous, name }))
            }
            onThumbnailChange={(bytes) => {
              setCoverEdited(true);
              setScenario((previous) => ({ ...previous, thumbnail: bytes }));
            }}
            onDescriptionChange={(text) =>
              setScenario((previous) => ({ ...previous, description: text }))
            }
          />
          <GameModeField
            value={scenario.initialGameMode}
            onChange={(v) =>
              setScenario((previous) => ({ ...previous, initialGameMode: v }))
            }
          />
          <Separator />
          <PromptComponentsEditor
            headerAction={<ScenarioQuestionsHelp />}
            components={fields.components}
            allowedTypes={SCENARIO_COMPONENT_TYPES}
            gameMode={scenario.initialGameMode}
            onAdd={addComponent}
            onUpdate={updateComponent}
            onRemove={removeComponent}
          />
          <ScenarioQuestionErrors content={scenario.content} />
          <Separator />
          <StatsEditor
            stats={fields.initialStats}
            onAdd={addStat}
            onUpdate={updateStat}
            onRemove={removeStat}
          />
          <Separator />
          <InventoryEditor
            items={fields.initialInventory}
            onAdd={addInventoryItem}
            onUpdate={updateInventoryItem}
            onRemove={removeInventoryItem}
          />
          <Separator />
          <StorybookEditor
            scenarioMode
            entries={fields.initialStoryCards}
            onAdd={addStoryCard}
            onUpdate={updateStoryCard}
            onRemove={removeStoryCard}
          />
        </fieldset>
      )}
      <PublishScenarioDialog
        open={Boolean(pendingPublish)}
        scenario={pendingPublish}
        updating={isPublished}
        thumbnailUploads={catalog.thumbnailUploads}
        catalog={catalog}
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        onEdit={(draft) => {
          setPendingPublish(null);
          setScenario(draft);
        }}
        onPublish={async (input) => {
          const result = await catalogActions.publish(input);
          if (currentId.current !== id) return;
          setScenario(input.scenario);
          setPendingPublish(null);
          await publishLinks.refresh();
          toast.success(
            result.moderation.status === "needs_review"
              ? t`Scenario submitted for moderation`
              : t`Scenario published`,
          );
        }}
      />
    </div>
  );
}
