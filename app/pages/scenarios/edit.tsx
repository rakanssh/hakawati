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
import { StoryCardsEditor } from "@/components/scenario/StoryCardsEditor";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { ArrowLeftIcon } from "lucide-react";

export default function ScenarioEdit() {
  const { id } = useParams({ from: "/scenarios/$id" });
  const navigate = useNavigate();
  const { scenario, setScenario, load, save, saving } = useScenarioEditor();

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
            className="rounded-xs"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <Label className="text-xl">Edit Scenario</Label>
        </div>
        <Button
          disabled={saving}
          className="rounded-xs"
          onClick={async () => {
            await handleSave();
          }}
        >
          Save Scenario
        </Button>
      </div>
      <Separator />
      <ScenarioBasicsFields
        name={scenario.name}
        thumbnail={scenario.thumbnail}
        initialDescription={scenario.initialDescription}
        initialAuthorNote={scenario.initialAuthorNote}
        openingText={scenario.openingText ?? ""}
        onNameChange={(name) => setScenario({ ...scenario, name })}
        onThumbnailChange={(bytes) =>
          setScenario({ ...scenario, thumbnail: bytes })
        }
        onInitialDescriptionChange={(text) =>
          setScenario({ ...scenario, initialDescription: text })
        }
        onInitialAuthorNoteChange={(text) =>
          setScenario({ ...scenario, initialAuthorNote: text })
        }
        onOpeningTextChange={(text) =>
          setScenario({ ...scenario, openingText: text })
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
