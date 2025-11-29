import { useTaleStore } from "@/store/useTaleStore";
import { usePersistTale } from "@/hooks/useGameSaves";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatItem } from "@/components/ui/stat-item";
import { InventoryItem } from "@/components/ui/inventory-item";
import { Plus, Package, BarChart3 } from "lucide-react";
import { useState } from "react";
import type { Stat } from "@/types/stats.type";

export default function SettingsInventoryStats() {
  const {
    stats,
    inventory,
    addToStats,
    updateStat,
    removeFromStats,
    addToInventory,
    updateItem,
    removeFromInventory,
    id,
  } = useTaleStore();
  const { save } = usePersistTale();

  const [newStatName, setNewStatName] = useState("");
  const [newStatDescription, setNewStatDescription] = useState("");
  const [newStatValue, setNewStatValue] = useState(50);
  const [newStatMax, setNewStatMax] = useState(100);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");

  const handleAddStat = () => {
    if (!newStatName.trim()) return;
    if (
      stats.some(
        (s) => s.name.toLowerCase() === newStatName.trim().toLowerCase(),
      )
    ) {
      return;
    }
    addToStats({
      name: newStatName.trim(),
      description: newStatDescription.trim() || undefined,
      value: Math.min(Math.max(newStatValue, 0), newStatMax),
      range: [0, newStatMax],
    });
    setNewStatName("");
    setNewStatDescription("");
    setNewStatValue(50);
    setNewStatMax(100);
    save(id);
  };

  const handleUpdateStat = (name: string, updates: Partial<Stat>) => {
    updateStat(name, updates);
    save(id);
  };

  const handleRemoveStat = (name: string) => {
    removeFromStats(name);
    save(id);
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    addToInventory(newItemName.trim(), newItemDescription.trim() || undefined);
    setNewItemName("");
    setNewItemDescription("");
    save(id);
  };

  const handleUpdateItem = (
    itemId: string,
    updates: { name?: string; description?: string },
  ) => {
    updateItem(itemId, updates);
    save(id);
  };

  const handleRemoveItem = (itemId: string) => {
    removeFromInventory(itemId);
    save(id);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full overflow-hidden">
      {/* Stats Section */}
      <section className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Stats</Label>
          <span className="text-xs text-muted-foreground ml-auto">
            {stats.length} {stats.length === 1 ? "stat" : "stats"}
          </span>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                placeholder="Stat name"
                value={newStatName}
                onChange={(e) => setNewStatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Current</span>
              <Input
                type="number"
                value={newStatValue}
                onChange={(e) => setNewStatValue(Number(e.target.value))}
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Max</span>
              <Input
                type="number"
                value={newStatMax}
                onChange={(e) => setNewStatMax(Number(e.target.value))}
                className="w-20"
              />
            </div>
            <Button
              onClick={handleAddStat}
              disabled={!newStatName.trim()}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Description (optional)
            </span>
            <Input
              placeholder="Add context for the AI..."
              value={newStatDescription}
              onChange={(e) => setNewStatDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
              className="text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="flex flex-col gap-2 pb-2">
            {stats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No stats yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Add a stat to track character attributes
                </p>
              </div>
            ) : (
              stats.map((stat) => (
                <StatItem
                  key={stat.name}
                  stat={stat}
                  onUpdate={handleUpdateStat}
                  onRemove={handleRemoveStat}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </section>

      {/* Divider */}
      <div className="hidden lg:block w-px bg-border" />
      <div className="lg:hidden h-px bg-border" />

      {/* Inventory Section */}
      <section className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Inventory</Label>
          <span className="text-xs text-muted-foreground ml-auto">
            {inventory.length} {inventory.length === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                placeholder="Add item..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              />
            </div>
            <Button
              onClick={handleAddItem}
              disabled={!newItemName.trim()}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Description (optional)
            </span>
            <Input
              placeholder="Add context for the AI..."
              value={newItemDescription}
              onChange={(e) => setNewItemDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              className="text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="flex flex-col gap-2 pb-2">
            {inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Inventory empty</p>
                <p className="text-xs text-muted-foreground/70">
                  Items collected will appear here
                </p>
              </div>
            ) : (
              inventory.map((item) => (
                <InventoryItem
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdateItem}
                  onRemove={handleRemoveItem}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
