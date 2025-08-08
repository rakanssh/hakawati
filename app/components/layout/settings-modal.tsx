import { useSettingsStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { ModelSelect } from "@/components/layout";
import { HelpCircle, InfoIcon, SettingsIcon, TrashIcon } from "lucide-react";
import { useScenarioStore } from "@/store/useScenarioStore";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@radix-ui/react-tooltip";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { nanoid } from "nanoid";

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

export function SettingsModal() {
  const { apiKey, setApiKey } = useSettingsStore();
  const {
    scenario,
    storyCards,
    setScenario,
    addStoryCard,
    removeStoryCard,
    updateStoryCard,
    setStoryCards,
  } = useScenarioStore();

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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="api">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="scenario">Scenario</TabsTrigger>
            <TabsTrigger value="storyCards">Story Cards</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>
          <TabsContent value="api">
            <div className="flex flex-col gap-2">
              <Label>API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Label>Model</Label>
              <ModelSelect />
            </div>
          </TabsContent>
          <TabsContent value="scenario">
            <div className="flex flex-col gap-2">
              <Label>Scenario</Label>
              <Input
                value={scenario.name}
                onChange={(e) =>
                  setScenario({ ...scenario, name: e.target.value })
                }
              />
              <Label>Description</Label>
              <Textarea
                value={scenario.description}
                onChange={(e) =>
                  setScenario({ ...scenario, description: e.target.value })
                }
              />
              <Label>Author Notes</Label>
              <Textarea
                value={scenario.authorNote}
                onChange={(e) =>
                  setScenario({ ...scenario, authorNote: e.target.value })
                }
              />
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={handleExportScenario}>
                  Export
                </Button>
                <Button variant="default" onClick={handleImportScenario}>
                  Import
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="storyCards">
            <div className="flex flex-col gap-4">
              <Button
                onClick={() =>
                  addStoryCard({ title: "New Card", content: "", triggers: [] })
                }
              >
                Add Story Card
              </Button>
              <ScrollArea className="h-72">
                <div className="flex flex-col gap-4 p-1">
                  {storyCards.map((card) => (
                    <div
                      key={card.id}
                      className="p-4 border rounded-md flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Name</Label>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => removeStoryCard(card.id)}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input
                        value={card.title}
                        onChange={(e) =>
                          updateStoryCard(card.id, { title: e.target.value })
                        }
                      />
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">Triggers</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1 bg-muted"
                            >
                              <InfoIcon className="w-3.5 h-3.5" />
                              <span>
                                These are words that will trigger adding this
                                card around the end of context.
                                <br />
                                Separate them with commas like:
                                pup,puppy,dog,canine
                              </span>
                            </Badge>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        value={card.triggers.join(", ")}
                        onChange={(e) =>
                          updateStoryCard(card.id, {
                            triggers: e.target.value
                              .split(",")
                              .map((s) => s.trim()),
                          })
                        }
                      />
                      <Label>Content</Label>
                      <Textarea
                        value={card.content}
                        onChange={(e) =>
                          updateStoryCard(card.id, { content: e.target.value })
                        }
                        rows={4}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent value="model">
            <div className="flex flex-col gap-2">
              <Label>Model settings</Label>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
