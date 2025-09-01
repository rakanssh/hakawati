import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StoryCard, StoryCardInput } from "@/types/context.type";

export type StoryCardsEditorProps = {
  cards: StoryCard[];
  onAdd: (input: StoryCardInput) => void;
  onUpdate: (id: string, update: Partial<StoryCardInput>) => void;
  onRemove: (id: string) => void;
};

export function StoryCardsEditor({
  cards,
  onAdd,
  onUpdate,
  onRemove,
}: StoryCardsEditorProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Label>Initial Story Cards</Label>
      <div className="flex flex-col gap-3">
        {cards.map((card) => (
          <div
            key={card.id}
            className="p-3 border rounded-md flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <Label className="text-sm">Name</Label>
              <Button
                variant={confirmDeleteId === card.id ? "destructive" : "ghost"}
                size="sm"
                className="h-6 rounded-xs"
                onClick={() => {
                  if (confirmDeleteId === card.id) {
                    onRemove(card.id);
                  }
                  setConfirmDeleteId(card.id);
                  setTimeout(() => setConfirmDeleteId(null), 1500);
                }}
              >
                {confirmDeleteId === card.id ? "Are you sure?" : "Delete Card"}
              </Button>
            </div>
            <Input
              value={card.title}
              onChange={(e) => onUpdate(card.id, { title: e.target.value })}
              className="rounded-xs"
            />
            <div className="flex items-center gap-1">
              <Label className="text-sm">Triggers</Label>
            </div>
            <Input
              value={card.triggers.join(", ")}
              onChange={(e) =>
                onUpdate(card.id, {
                  triggers: e.target.value.split(",").map((s) => s.trim()),
                })
              }
              className="rounded-xs"
            />
            <Label className="text-sm">Content</Label>
            <Textarea
              value={card.content}
              onChange={(e) => onUpdate(card.id, { content: e.target.value })}
              rows={4}
              className="rounded-xs"
            />
          </div>
        ))}
        <Button
          onClick={() =>
            onAdd({ title: "New Card", content: "", triggers: [] })
          }
          className="rounded-xs"
        >
          Add Story Card
        </Button>
      </div>
    </div>
  );
}
