import { Label } from "@/components/ui/label";
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
  const { id } = useParams({ from: "/scenarios/$id" });
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
    navigate({ to: `/scenarios` });
  };

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
            <Trans>Edit Scenario</Trans>
          </Label>
        </div>
        <Button
          disabled={saving}
          onClick={async () => {
            await handleSave();
          }}
        >
          <Trans>Save Scenario</Trans>
        </Button>
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
    </div>
  );
}
