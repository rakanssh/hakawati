import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaleStore } from "@/store/useTaleStore";
import { Plus, X, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SettingsInventory() {
  const { inventory, addToInventory, removeFromInventory } = useTaleStore();
  const [newItemName, setNewItemName] = useState("");

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    addToInventory(newItemName.trim());
    setNewItemName("");
  };

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {inventory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Inventory is empty</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inventory.map((item) => (
            <Badge
              key={item.id}
              variant="secondary"
              className="group ps-3 pe-1.5 py-1.5 text-sm gap-1.5 hover:bg-secondary/80"
            >
              {item.name}
              <button
                onClick={() => removeFromInventory(item.id)}
                className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 p-3 rounded-xs border border-dashed">
        <Input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add item (e.g., Sword, Health Potion)"
          onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={handleAddItem}
          disabled={!newItemName.trim()}
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
