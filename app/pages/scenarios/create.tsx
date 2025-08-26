import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useScenarioEditor } from "@/hooks/useScenarios";
import { bytesToObjectUrl } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

export default function ScenarioCreate() {
  const navigate = useNavigate();
  const { scenario, setScenario, save, startTale, saving } =
    useScenarioEditor();

  const previewUrl = useMemo(
    () => bytesToObjectUrl(scenario.thumbnailWebp),
    [scenario.thumbnailWebp],
  );

  return (
    <div className="container mx-auto py-10 flex flex-col gap-4 max-w-2xl">
      <Label className="text-xl">Create Scenario</Label>
      <Separator />
      <div className="flex flex-col gap-2">
        <Label>Name</Label>
        <Input
          value={scenario.name}
          onChange={(e) => setScenario({ ...scenario, name: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Thumbnail</Label>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="thumbnail preview"
            className="h-28 w-full object-cover rounded border"
          />
        )}
        <Input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const arrayBuffer = await file.arrayBuffer();
            setScenario({
              ...scenario,
              thumbnailWebp: new Uint8Array(arrayBuffer),
            });
          }}
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
            navigate({ to: `/scenarios` });
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
