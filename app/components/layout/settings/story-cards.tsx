import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTaleStore } from "@/store/useTaleStore";
import { StorybookEditor } from "@/components/storybook";

export default function SettingsStoryCards() {
  const { storyCards, addStoryCard, updateStoryCard, removeStoryCard } =
    useTaleStore();

  return (
    <div className="flex flex-col max-w-2xl h-full gap-4">
      <Label>Story Cards</Label>
      <Separator />
      <StorybookEditor
        entries={storyCards}
        onAdd={addStoryCard}
        onUpdate={updateStoryCard}
        onRemove={removeStoryCard}
      />
    </div>
  );
}
