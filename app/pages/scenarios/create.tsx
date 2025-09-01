import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate } from "@tanstack/react-router";
import { ScenarioBasicsFields } from "@/components/scenario/ScenarioBasicsFields";
import { GameModeField } from "@/components/scenario/GameModeField";
import { StatsEditor } from "@/components/scenario/StatsEditor";
import { InventoryEditor } from "@/components/scenario/InventoryEditor";
import { StoryCardsEditor } from "@/components/scenario/StoryCardsEditor";
import { useScenarioForm } from "@/hooks/useScenarioForm";

export default function ScenarioCreate() {
  const navigate = useNavigate();
  const { scenario, setScenario, save, saving } = useScenarioEditor();

  const {
    addStat,
    updateStat,
    removeStat,
    addInventoryItem,
    updateInventoryItem,
    removeInventoryItem,
    addStoryCard,
    updateStoryCard,
    removeStoryCard,
  } = useScenarioForm(scenario, setScenario);

  return (
    <div className="container mx-auto py-10 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <Label className="text-xl">Create Scenario</Label>
        <Button
          disabled={saving}
          onClick={async () => {
            await save();
            navigate({ to: `/scenarios` });
          }}
          className="rounded-xs"
        >
          Save Scenario
        </Button>
      </div>
      <Separator />
      <ScenarioBasicsFields
        name={scenario.name}
        thumbnailWebp={scenario.thumbnailWebp}
        initialDescription={scenario.initialDescription}
        initialAuthorNote={scenario.initialAuthorNote}
        onNameChange={(name) => setScenario({ ...scenario, name })}
        onThumbnailChange={(bytes) =>
          setScenario({ ...scenario, thumbnailWebp: bytes })
        }
        onInitialDescriptionChange={(text) =>
          setScenario({ ...scenario, initialDescription: text })
        }
        onInitialAuthorNoteChange={(text) =>
          setScenario({ ...scenario, initialAuthorNote: text })
        }
      />
      <GameModeField
        value={scenario.initialGameMode}
        onChange={(v) => setScenario({ ...scenario, initialGameMode: v })}
      />
      <Separator />
      <StatsEditor
        stats={scenario.initialStats}
        onAdd={addStat}
        onUpdate={updateStat}
        onRemove={removeStat}
      />
      <Separator />
      <InventoryEditor
        items={scenario.initialInventory}
        onAdd={addInventoryItem}
        onUpdate={updateInventoryItem}
        onRemove={removeInventoryItem}
      />
      <Separator />
      <StoryCardsEditor
        cards={scenario.initialStoryCards}
        onAdd={addStoryCard}
        onUpdate={updateStoryCard}
        onRemove={removeStoryCard}
      />
    </div>
  );
}
