import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, InfoIcon, TrashIcon } from "lucide-react";
import { useScenarioStore } from "@/store/useScenarioStore";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function SettingsStoryCards() {
  const { storyCards, addStoryCard, removeStoryCard, updateStoryCard } =
    useScenarioStore();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(".", { replace: true });
  }, [navigate]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl h-full">
      <ScrollArea className="h-full">
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
                        These are words that will trigger adding this card
                        around the end of context.
                        <br />
                        Separate them with commas like: pup,puppy,dog,canine
                      </span>
                    </Badge>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                value={card.triggers.join(", ")}
                onChange={(e) =>
                  updateStoryCard(card.id, {
                    triggers: e.target.value.split(",").map((s) => s.trim()),
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
          <Button
            onClick={() =>
              addStoryCard({ title: "New Card", content: "", triggers: [] })
            }
          >
            Add Story Card
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
