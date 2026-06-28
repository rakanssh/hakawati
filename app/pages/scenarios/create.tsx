import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  PublishScenarioDialog,
  ScenarioBasicsFields,
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

export default function ScenarioCreate() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const catalog = useCatalogClient();
  const catalogActions = useCatalogActions(catalog);
  const canPublishOnCreate = catalog.enabled && catalog.signedIn;
  const [publishAfterCreate, setPublishAfterCreate] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
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
    <div className="container mx-auto py-10 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <Button
            variant="default"
            onClick={() => navigate({ to: `/scenarios` })}
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <Label className="text-xl">
            <Trans>Create Scenario</Trans>
          </Label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canPublishOnCreate ? (
            <label className="flex h-10 items-center gap-2 rounded-xs border border-input bg-background/40 px-3 text-sm font-medium hover:bg-accent">
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
            disabled={saving}
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
      <ScenarioBasicsFields
        name={scenario.name}
        thumbnail={scenario.thumbnail}
        description={scenario.description}
        onNameChange={(name) => setScenario({ ...scenario, name })}
        onThumbnailChange={(bytes) =>
          setScenario({ ...scenario, thumbnail: bytes })
        }
        onDescriptionChange={(text) =>
          setScenario({ ...scenario, description: text })
        }
      />
      <GameModeField
        value={scenario.initialGameMode}
        onChange={(v) => setScenario({ ...scenario, initialGameMode: v })}
      />
      <Separator />
      <PromptComponentsEditor
        components={fields.components}
        allowedTypes={SCENARIO_COMPONENT_TYPES}
        gameMode={scenario.initialGameMode}
        onAdd={addComponent}
        onUpdate={updateComponent}
        onRemove={removeComponent}
      />
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
        entries={fields.initialStoryCards}
        onAdd={addStoryCard}
        onUpdate={updateStoryCard}
        onRemove={removeStoryCard}
      />
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
        onPublish={async ({ metadata, thumbnailFile }) => {
          if (!pendingPublish) return;
          try {
            await catalogActions.publish({
              scenario: pendingPublish,
              metadata,
              thumbnailFile,
            });
            toast.success(t`Scenario published`);
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
