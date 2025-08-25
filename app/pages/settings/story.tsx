import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { useGameStore } from "@/store/useGameStore";

// type ExportedScenarioV1 = {
//   format: "hakawati-scenario";
//   version: 1;
//   exportedAt: string;
//   scenario: Scenario;
//   storyCards: { title: string; triggers: string[]; content: string }[];
// };

export default function SettingsStory() {
  // const { scenario, storyCards, setScenario, setStoryCards } =
  //   useScenarioStore();
  const { description, authorNote, setDescription, setAuthorNote } =
    useGameStore();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "." });
  }, [navigate]);

  // TODO: Move to scenario UI later
  // async function handleExportScenario() {
  //   try {
  //     const exportPayload: ExportedScenarioV1 = {
  //       format: "hakawati-scenario",
  //       version: 1,
  //       exportedAt: new Date().toISOString(),
  //       scenario: {
  //         id: scenario.id,
  //         name: scenario.name,
  //         description: scenario.description,
  //         authorNote: scenario.authorNote,
  //         initialStats: Array.isArray(scenario.initialStats)
  //           ? scenario.initialStats
  //           : [],
  //         initialInventory: Array.isArray(scenario.initialInventory)
  //           ? scenario.initialInventory
  //           : [],
  //         initialStoryCards: Array.isArray(scenario.initialStoryCards)
  //           ? scenario.initialStoryCards.map(
  //               ({ title, triggers, content, id }) => ({
  //                 id: id ?? nanoid(12),
  //                 title,
  //                 triggers,
  //                 content,
  //               }),
  //             )
  //           : [],
  //       },
  //       storyCards: storyCards.map(({ title, triggers, content, id }) => ({
  //         id: id ?? nanoid(12),
  //         title,
  //         triggers,
  //         content,
  //       })),
  //     };
  //     const json = JSON.stringify(exportPayload, null, 2);
  //     await navigator.clipboard.writeText(json);
  //     toast.success("Scenario exported to clipboard", {
  //       description: `${exportPayload.storyCards.length} story card(s) included`,
  //     });
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : String(error);
  //     toast.error("Failed to export scenario", { description: message });
  //   }
  // }

  // TODO: Move to scenario UI later
  // async function handleImportScenario() {
  //   try {
  //     const text = await navigator.clipboard.readText();
  //     let data: unknown;
  //     try {
  //       data = JSON.parse(text);
  //     } catch {
  //       toast.error("Clipboard does not contain valid JSON");
  //       return;
  //     }

  //     const payload = data as Partial<ExportedScenarioV1>;
  //     if (
  //       !payload ||
  //       payload.format !== "hakawati-scenario" ||
  //       payload.version !== 1 ||
  //       !payload.scenario ||
  //       !Array.isArray(payload.storyCards)
  //     ) {
  //       toast.error("Invalid scenario format in clipboard");
  //       return;
  //     }

  //     const importedScenario = {
  //       id: payload.scenario.id ?? nanoid(12),
  //       name: payload.scenario.name ?? "Imported",
  //       description: payload.scenario.description ?? "",
  //       authorNote: payload.scenario.authorNote ?? "",
  //       initialStats: Array.isArray(payload.scenario.initialStats)
  //         ? payload.scenario.initialStats
  //         : [],
  //       initialInventory: Array.isArray(payload.scenario.initialInventory)
  //         ? payload.scenario.initialInventory
  //         : [],
  //       initialStoryCards: Array.isArray(payload.scenario.initialStoryCards)
  //         ? payload.scenario.initialStoryCards.map((c) => ({
  //             id: nanoid(12),
  //             title: c.title ?? "Untitled",
  //             triggers: Array.isArray(c.triggers) ? c.triggers : [],
  //             content: c.content ?? "",
  //           }))
  //         : [],
  //     };

  //     const importedStoryCards = payload.storyCards.map((c) => ({
  //       id: nanoid(12),
  //       title: c.title ?? "Untitled",
  //       triggers: Array.isArray(c.triggers) ? c.triggers : [],
  //       content: c.content ?? "",
  //     }));

  //     setScenario(importedScenario as typeof scenario);
  //     setStoryCards(importedStoryCards);

  //     toast.success("Scenario imported", {
  //       description: `${importedStoryCards.length} story card(s) loaded`,
  //     });
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : String(error);
  //     toast.error("Failed to import scenario", { description: message });
  //   }
  // }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Label>Story</Label>
      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Author Notes</Label>
        <Textarea
          value={authorNote}
          onChange={(e) => setAuthorNote(e.target.value)}
          rows={4}
        />
      </div>
      {/* <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={handleExportScenario}>
          Export
        </Button>
        <Button variant="default" onClick={handleImportScenario}>
          Import
        </Button>
      </div> */}
    </div>
  );
}
