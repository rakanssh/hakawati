import { useTaleStore } from "@/store/useTaleStore";
import { StorybookEditor } from "@/components/storybook";

export default function SettingsStoryCards() {
  const { storyCards, addStoryCard, updateStoryCard, removeStoryCard } =
    useTaleStore();

  return (
    <div className="flex flex-col max-w-full h-full gap-4">
      <StorybookEditor
        entries={storyCards}
        onAdd={addStoryCard}
        onUpdate={updateStoryCard}
        onRemove={removeStoryCard}
      />
    </div>
  );
}
