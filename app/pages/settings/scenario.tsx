import { useScenarioStore } from "@/store/useScenarioStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useEffect } from "react";
import { useNavigate } from "react-router";

type ExportedScenarioV1 = {
  format: "hakawati-scenario";
  version: 1;
  exportedAt: string;
  scenario: {
    name: string;
    description: string;
    authorNote: string;
    initialStats: { name: string; value: number; range: [number, number] }[];
    initialInventory: string[];
    initialStoryCards: { title: string; triggers: string[]; content: string }[];
  };
  storyCards: { title: string; triggers: string[]; content: string }[];
};

export default function SettingsScenario() {
  const { scenario, storyCards, setScenario, setStoryCards } =
    useScenarioStore();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(".", { replace: true });
  }, [navigate]);

  async function handleExportScenario() {
    try {
      const exportPayload: ExportedScenarioV1 = {
        format: "hakawati-scenario",
        version: 1,
        exportedAt: new Date().toISOString(),
        scenario: {
          name: scenario.name,
          description: scenario.description,
          authorNote: scenario.authorNote,
          initialStats: Array.isArray(scenario.initialStats)
            ? scenario.initialStats
            : [],
          initialInventory: Array.isArray(scenario.initialInventory)
            ? scenario.initialInventory
            : [],
          initialStoryCards: Array.isArray(scenario.initialStoryCards)
            ? scenario.initialStoryCards.map(
                ({ title, triggers, content }) => ({
                  title,
                  triggers,
                  content,
                })
              )
            : [],
        },
        storyCards: storyCards.map(({ title, triggers, content }) => ({
          title,
          triggers,
          content,
        })),
      };
      const json = JSON.stringify(exportPayload, null, 2);
      await navigator.clipboard.writeText(json);
      toast.success("Scenario exported to clipboard", {
        description: `${exportPayload.storyCards.length} story card(s) included`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to export scenario", { description: message });
    }
  }

  async function handleImportScenario() {
    try {
      const text = await navigator.clipboard.readText();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        toast.error("Clipboard does not contain valid JSON");
        return;
      }

      const payload = data as Partial<ExportedScenarioV1>;
      if (
        !payload ||
        payload.format !== "hakawati-scenario" ||
        payload.version !== 1 ||
        !payload.scenario ||
        !Array.isArray(payload.storyCards)
      ) {
        toast.error("Invalid scenario format in clipboard");
        return;
      }

      const importedScenario = {
        name: payload.scenario.name ?? "Imported",
        description: payload.scenario.description ?? "",
        authorNote: payload.scenario.authorNote ?? "",
        initialStats: Array.isArray(payload.scenario.initialStats)
          ? payload.scenario.initialStats
          : [],
        initialInventory: Array.isArray(payload.scenario.initialInventory)
          ? payload.scenario.initialInventory
          : [],
        initialStoryCards: Array.isArray(payload.scenario.initialStoryCards)
          ? payload.scenario.initialStoryCards.map((c) => ({
              id: nanoid(12),
              title: c.title ?? "Untitled",
              triggers: Array.isArray(c.triggers) ? c.triggers : [],
              content: c.content ?? "",
            }))
          : [],
      };

      const importedStoryCards = payload.storyCards.map((c) => ({
        id: nanoid(12),
        title: c.title ?? "Untitled",
        triggers: Array.isArray(c.triggers) ? c.triggers : [],
        content: c.content ?? "",
      }));

      setScenario(importedScenario as typeof scenario);
      setStoryCards(importedStoryCards);

      toast.success("Scenario imported", {
        description: `${importedStoryCards.length} story card(s) loaded`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to import scenario", { description: message });
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-2">
        <Label>Scenario</Label>
        <Input
          value={scenario.name}
          onChange={(e) => setScenario({ ...scenario, name: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Description</Label>
        <Textarea
          value={scenario.description}
          onChange={(e) =>
            setScenario({ ...scenario, description: e.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Author Notes</Label>
        <Textarea
          value={scenario.authorNote}
          onChange={(e) =>
            setScenario({ ...scenario, authorNote: e.target.value })
          }
          rows={4}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={handleExportScenario}>
          Export
        </Button>
        <Button variant="default" onClick={handleImportScenario}>
          Import
        </Button>
      </div>
    </div>
  );
}
