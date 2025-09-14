import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HelpTooltip } from "@/components/ui";
import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useTaleStore } from "@/store/useTaleStore";

export default function SettingsStoryCards() {
  const { storyCards, addStoryCard, removeStoryCard, updateStoryCard } =
    useTaleStore();
  const [currentlyDeleting, setCurrentlyDeleting] = useState<string | null>(
    null,
  );

  const handleClickDelete = (id: string) => {
    if (currentlyDeleting === id) {
      removeStoryCard(id);
    }
    setCurrentlyDeleting(id);
    setTimeout(() => {
      setCurrentlyDeleting(null);
    }, 1500);
  };

  return (
    <div className="flex flex-col max-w-2xl h-full gap-4">
      <Label>Story Cards</Label>
      <Separator />
      <div className="flex flex-col gap-3">
        {storyCards.map((card) => (
          <div
            key={card.id}
            className="p-3 border rounded-md flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <Label className="text-sm">Name</Label>
              <Button
                variant={
                  currentlyDeleting === card.id ? "destructive" : "ghost"
                }
                size="sm"
                className="h-6 "
                onClick={() => handleClickDelete(card.id)}
              >
                {currentlyDeleting === card.id ? (
                  <Label className="text-xs">Are you sure?</Label>
                ) : (
                  <Label className="text-xs">Delete Card &nbsp;</Label>
                )}
              </Button>
            </div>
            <Input
              value={card.title}
              onChange={(e) =>
                updateStoryCard(card.id, { title: e.target.value })
              }
            />
            <div className="flex items-center gap-1">
              <Label className="text-sm">Triggers</Label>
              <HelpTooltip>
                <span>
                  These are words that will trigger adding this card around the
                  end of context.
                  <br />
                  Separate them with commas like: pup,puppy,dog,canine
                </span>
              </HelpTooltip>
            </div>
            <Input
              value={card.triggers.join(", ")}
              onChange={(e) =>
                updateStoryCard(card.id, {
                  triggers: e.target.value.split(",").map((s) => s.trim()),
                })
              }
            />
            <Label className="text-sm">Content</Label>
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
    </div>
  );
}
