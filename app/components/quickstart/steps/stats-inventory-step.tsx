import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stat } from "@/types/stats.type";
import { ARCHETYPES } from "@/data/quickstart-presets";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface StatsInventoryStepProps {
  stats: Stat[];
  inventory: string[];
  archetype: string;
  setting: string;
  onStatsChange: (stats: Stat[]) => void;
  onInventoryChange: (inventory: string[]) => void;
}

export function StatsInventoryStep({
  stats,
  inventory,
  archetype,
  setting,
  onStatsChange,
  onInventoryChange,
}: StatsInventoryStepProps) {
  const [newStatName, setNewStatName] = useState("");
  const [newStatValue, setNewStatValue] = useState("50");
  const [newStatMax, setNewStatMax] = useState("100");
  const [newItemName, setNewItemName] = useState("");

  // Initialize with archetype defaults if empty
  useEffect(() => {
    if (stats.length === 0) {
      const archetypeData = ARCHETYPES[setting]?.find(
        (a) => a.id === archetype,
      );
      if (archetypeData?.defaultStats) {
        onStatsChange([...archetypeData.defaultStats]);
      } else {
        onStatsChange([{ name: "HP", value: 100, range: [0, 100] }]);
      }
    }
  }, [archetype, setting, stats.length, onStatsChange]);

  useEffect(() => {
    if (inventory.length === 0) {
      const archetypeData = ARCHETYPES[setting]?.find(
        (a) => a.id === archetype,
      );
      if (archetypeData?.defaultInventory) {
        onInventoryChange([...archetypeData.defaultInventory]);
      }
    }
  }, [archetype, setting, inventory.length, onInventoryChange]);

  const handleAddStat = () => {
    if (!newStatName.trim()) return;
    const value = parseInt(newStatValue) || 50;
    const max = parseInt(newStatMax) || 100;
    onStatsChange([
      ...stats,
      { name: newStatName.trim(), value, range: [0, max] },
    ]);
    setNewStatName("");
    setNewStatValue("50");
    setNewStatMax("100");
  };

  const handleRemoveStat = (index: number) => {
    onStatsChange(stats.filter((_, i) => i !== index));
  };

  const handleUpdateStat = (index: number, updates: Partial<Stat>) => {
    onStatsChange(
      stats.map((stat, i) => (i === index ? { ...stat, ...updates } : stat)),
    );
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    onInventoryChange([...inventory, newItemName.trim()]);
    setNewItemName("");
  };

  const handleRemoveItem = (index: number) => {
    onInventoryChange(inventory.filter((_, i) => i !== index));
  };

  const handleResetToDefaults = () => {
    const archetypeData = ARCHETYPES[setting]?.find((a) => a.id === archetype);
    if (archetypeData?.defaultStats) {
      onStatsChange([...archetypeData.defaultStats]);
    }
    if (archetypeData?.defaultInventory) {
      onInventoryChange([...archetypeData.defaultInventory]);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure your character&apos;s stats and inventory
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetToDefaults}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </Button>
      </div>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                {stats.map((stat, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <Input
                        value={stat.name}
                        onChange={(e) =>
                          handleUpdateStat(index, { name: e.target.value })
                        }
                        placeholder="Stat name"
                      />
                      <Input
                        type="number"
                        value={stat.value}
                        onChange={(e) =>
                          handleUpdateStat(index, {
                            value: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="Value"
                      />
                      <Input
                        type="number"
                        value={stat.range[1]}
                        onChange={(e) =>
                          handleUpdateStat(index, {
                            range: [
                              stat.range[0],
                              parseInt(e.target.value) || 100,
                            ],
                          })
                        }
                        placeholder="Max"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStat(index)}
                      className="shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Add New Stat
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <Input
                        value={newStatName}
                        onChange={(e) => setNewStatName(e.target.value)}
                        placeholder="Name"
                        onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
                      />
                      <Input
                        type="number"
                        value={newStatValue}
                        onChange={(e) => setNewStatValue(e.target.value)}
                        placeholder="Value"
                        onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
                      />
                      <Input
                        type="number"
                        value={newStatMax}
                        onChange={(e) => setNewStatMax(e.target.value)}
                        placeholder="Max"
                        onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleAddStat}
                      disabled={!newStatName.trim()}
                      className="shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {inventory.length > 0 ? (
                  <div className="space-y-2">
                    {inventory.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 bg-muted rounded-md text-sm">
                          {item}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          className="shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No items yet.
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Add Item
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Item name (e.g., Sword, Potion)"
                      onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleAddItem}
                      disabled={!newItemName.trim()}
                      className="shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
