import { useGameStore } from "@/store/useGameStore";
import { Item } from "@/types";
import { InlineEditableBadge } from "./inline-editable-badge";

export function InventoryItem({ item }: { item: Item }) {
  const { updateItem, removeFromInventory } = useGameStore();

  return (
    <div className="flex flex-row items-center justify-between">
      <InlineEditableBadge
        label={item.name}
        onRename={(newName) => updateItem(item.id, { name: newName })}
        onRemove={() => removeFromInventory(item.id)}
        className="cursor-pointer border-white/50 text-wrap whitespace-normal text-left"
      />
    </div>
  );
}
