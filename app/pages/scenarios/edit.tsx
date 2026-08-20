import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { ScenarioBasicsFields } from "@/components/scenario/ScenarioBasicsFields";
import { GameModeField } from "@/components/scenario/GameModeField";
import { StatsEditor } from "@/components/scenario/StatsEditor";
import { InventoryEditor } from "@/components/scenario/InventoryEditor";
import { StorybookEditor } from "@/components/storybook";
import { PromptComponentsEditor } from "@/components/prompt-components/PromptComponentsEditor";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { SCENARIO_COMPONENT_TYPES } from "@/lib/prompt-components";
import { ArrowLeftIcon } from "lucide-react";
import { Trans } from "@lingui/react/macro";
export default function ScenarioEdit() {
  const { id } = useParams({ from: "/scenarios/$id/edit" });
  const navigate = useNavigate();
  const { scenario, setScenario, load, save, saving } = useScenarioEditor();

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
    if (id) void load(id);
  }, [id, load]);

  const handleSave = async () => {
    await save();
    navigate({ to: `/scenarios/${id}` });
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
          <div className="min-w-0 text-sm text-muted-foreground">
            <span className="text-primary">
              <Trans>Your scenarios</Trans>
            </span>
            <span className="px-2">/</span>
            <span>
              <Trans>Edit</Trans>
            </span>
          </div>
        </div>
        <Button
          disabled={saving}
          className="w-full sm:w-auto"
          onClick={async () => {
            await handleSave();
          }}
        >
          <Trans>Save Scenario</Trans>
        </Button>
      </header>
      <Separator />
      <main className="flex w-full max-w-3xl flex-col gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            <Trans>Edit Scenario</Trans>
          </h1>
          <p className="text-base text-muted-foreground">{scenario.name}</p>
        </div>
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
      </main>
    </div>
  );
}
