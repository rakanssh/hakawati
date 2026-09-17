import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  PublishScenarioDialog,
  ScenarioBasicsFields,
  ScenarioBreadcrumb,
} from "@/components/scenario";
import { GameModeField } from "@/components/scenario/GameModeField";
import { StatsEditor } from "@/components/scenario/StatsEditor";
import { InventoryEditor } from "@/components/scenario/InventoryEditor";
import { StorybookEditor } from "@/components/storybook";
import { PromptComponentsEditor } from "@/components/prompt-components/PromptComponentsEditor";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { SCENARIO_COMPONENT_TYPES } from "@/lib/prompt-components";
import { Scenario } from "@/types";
import { ArrowLeftIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  useCatalogActions,
  useCatalogClient,
} from "@/hooks/useCatalogScenarios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ScenarioQuestionErrors,
  ScenarioQuestionsHelp,
} from "@/components/scenario/ScenarioQuestionsHelp";

export default function ScenarioCreate() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const catalog = useCatalogClient();
  const catalogActions = useCatalogActions(catalog);
  const canPublishOnCreate = catalog.enabled && catalog.signedIn;
  const [publishAfterCreate, setPublishAfterCreate] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const [readingCover, setReadingCover] = useState(false);
  const importedScenario = useRouterState({
    select: (s) =>
      // @ts-expect-error - importedScenario is not typed
      s.location.state?.importedScenario as
        | ReturnType<typeof Object>
        | undefined,
  }) as unknown as Partial<Scenario> | undefined;
  const { scenario, setScenario, save, saving } =
    useScenarioEditor(importedScenario);

  useEffect(() => {
    if (!canPublishOnCreate) setPublishAfterCreate(false);
  }, [canPublishOnCreate]);

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

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: `/scenarios` })}
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <ScenarioBreadcrumb
            to="/scenarios"
            parent={<Trans>Scenarios</Trans>}
            current={<Trans>Create</Trans>}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canPublishOnCreate ? (
            <label className="flex h-9 items-center gap-2 rounded-xs border border-input bg-background/40 px-3 text-sm font-medium hover:bg-accent">
              <Checkbox
                checked={publishAfterCreate}
                onCheckedChange={(checked) =>
                  setPublishAfterCreate(checked === true)
                }
              />
              <Trans>Publish</Trans>
            </label>
          ) : null}
          <Button
            disabled={saving || readingCover}
            onClick={async () => {
              const id = await save();
              if (publishAfterCreate && canPublishOnCreate) {
                setPendingPublish({ ...scenario, id });
                return;
              }
              navigate({ to: `/scenarios` });
            }}
          >
            <Trans>Create</Trans>
          </Button>
        </div>
      </div>
      <Separator />
      <fieldset
        disabled={saving}
        className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4"
      >
        <ScenarioBasicsFields
          name={scenario.name}
          thumbnail={scenario.thumbnail}
          description={scenario.description}
          disabled={saving}
          onCoverReadingChange={setReadingCover}
          onNameChange={(name) =>
            setScenario((previous) => ({ ...previous, name }))
          }
          onThumbnailChange={(bytes) =>
            setScenario((previous) => ({ ...previous, thumbnail: bytes }))
          }
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
      <PublishScenarioDialog
        open={Boolean(pendingPublish)}
        scenario={pendingPublish}
        updating={false}
        thumbnailUploads={catalog.thumbnailUploads}
        catalog={catalog}
        onOpenChange={(open) => {
          if (open) return;
          setPendingPublish(null);
          navigate({ to: `/scenarios` });
        }}
        onEdit={() => {
          if (!pendingPublish) return;
          void navigate({ to: `/scenarios/${pendingPublish.id}/edit` });
          setPendingPublish(null);
        }}
        onPublish={async (input) => {
          if (!pendingPublish) return;
          try {
            const result = await catalogActions.publish(input);
            toast.success(
              result.moderation.status === "needs_review"
                ? t`Scenario submitted for moderation`
                : t`Scenario published`,
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : t`Failed to publish scenario`,
            );
            throw error;
          }
        }}
      />
    </div>
  );
}
