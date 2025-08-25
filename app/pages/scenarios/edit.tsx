import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export default function ScenarioEdit() {
  const { id } = useParams({ from: "/scenarios/$id" });
  const navigate = useNavigate();
  const { scenario, setScenario, load, save, startTale, saving } =
    useScenarioEditor();

  useEffect(() => {
    if (id) void load(id);
  }, [id, load]);

  return (
    <div className="container mx-auto py-10 flex flex-col gap-4 max-w-2xl">
      <Label className="text-xl">Edit Scenario</Label>
      <Separator />
      <div className="flex flex-col gap-2">
        <Label>Name</Label>
        <Input
          value={scenario.name}
          onChange={(e) => setScenario({ ...scenario, name: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Initial Description</Label>
        <Textarea
          value={scenario.initialDescription}
          onChange={(e) =>
            setScenario({ ...scenario, initialDescription: e.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Initial Author Notes</Label>
        <Textarea
          value={scenario.initialAuthorNote}
          onChange={(e) =>
            setScenario({ ...scenario, initialAuthorNote: e.target.value })
          }
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={saving}
          onClick={async () => {
            await save();
          }}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          onClick={async () => {
            await startTale();
            navigate({ to: "/demo" });
          }}
        >
          Start Tale
        </Button>
      </div>
    </div>
  );
}
