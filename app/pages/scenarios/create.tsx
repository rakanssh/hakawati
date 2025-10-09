import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ScenarioBasicsFields } from "@/components/scenario/ScenarioBasicsFields";
import { GameModeField } from "@/components/scenario/GameModeField";
import { StatsEditor } from "@/components/scenario/StatsEditor";
import { InventoryEditor } from "@/components/scenario/InventoryEditor";
import { StorybookEditor } from "@/components/storybook";
import { useScenarioForm } from "@/hooks/useScenarioForm";
import { Scenario } from "@/types";
import { ArrowLeftIcon } from "lucide-react";

export default function ScenarioCreate() {
  const navigate = useNavigate();
  const importedScenario = useRouterState({
    select: (s) =>
      // @ts-expect-error - importedScenario is not typed
      s.location.state?.importedScenario as
        | ReturnType<typeof Object>
        | undefined,
  }) as unknown as Partial<Scenario> | undefined;
  const { scenario, setScenario, save, saving } =
    useScenarioEditor(importedScenario);

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
        <div className="flex gap-4">
          <Button
            variant="default"
            onClick={() => navigate({ to: `/scenarios` })}
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <Label className="text-xl">Create Scenario</Label>
        </div>
        <Button
          disabled={saving}
          onClick={async () => {
            await save();
            navigate({ to: `/scenarios` });
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
      <StorybookEditor
        entries={scenario.initialStoryCards}
        onAdd={addStoryCard}
        onUpdate={updateStoryCard}
        onRemove={removeStoryCard}
      />
    </div>
  );
}
