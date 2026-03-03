import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatItem } from "@/components/ui/stat-item";
import { InventoryItem } from "@/components/ui/inventory-item";
import { Stat } from "@/types/stats.type";
import type { Item } from "@/types/item.type";
import { ARCHETYPES } from "@/data/quickstart-presets";
import { Plus, RotateCcw, BarChart3, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { nanoid } from "nanoid";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";

interface StatsInventoryStepProps {
  stats: Stat[];
  inventory: Item[];
  archetype: string;
  setting: string;
  onStatsChange: (stats: Stat[]) => void;
  onInventoryChange: (inventory: Item[]) => void;
}

export function StatsInventoryStep({
  stats,
  inventory,
  archetype,
  setting,
  onStatsChange,
  onInventoryChange,
}: StatsInventoryStepProps) {
  const { t } = useLingui();
  const { _: resolveMessage } = useLinguiCore();
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
        onStatsChange(
          archetypeData.defaultStats.map((stat) => ({
            name: resolveMessage(stat.name),
            value: stat.value,
            range: stat.range,
            description: stat.description
              ? resolveMessage(stat.description)
              : undefined,
          })),
        );
      } else {
        onStatsChange([{ name: "HP", value: 100, range: [0, 100] }]);
      }
    }
  }, [archetype, setting, stats.length, onStatsChange, resolveMessage]);

  useEffect(() => {
    if (inventory.length === 0) {
      const archetypeData = ARCHETYPES[setting]?.find(
        (a) => a.id === archetype,
      );
      if (
        archetypeData?.defaultInventory &&
        archetypeData.defaultInventory.length > 0
      ) {
        onInventoryChange(
          archetypeData.defaultInventory.map((item) => ({
            id: nanoid(12),
            name: resolveMessage(item.name),
            description: item.description
              ? resolveMessage(item.description)
              : undefined,
          })),
        );
      }
    }
  }, [archetype, setting, inventory.length, onInventoryChange, resolveMessage]);

  const handleAddStat = () => {
    if (!newStatName.trim()) return;
    if (
      stats.some(
        (s) => s.name.toLowerCase() === newStatName.trim().toLowerCase(),
      )
    ) {
      return;
    }
    const value = parseInt(newStatValue) || 50;
    const max = parseInt(newStatMax) || 100;
    onStatsChange([
      ...stats,
      {
        name: newStatName.trim(),
        value: Math.min(Math.max(value, 0), max),
        range: [0, max],
      },
    ]);
    setNewStatName("");
    setNewStatValue("50");
    setNewStatMax("100");
  };

  const handleUpdateStat = (name: string, updates: Partial<Stat>) => {
    onStatsChange(
      stats.map((stat) =>
        stat.name === name ? { ...stat, ...updates } : stat,
      ),
    );
  };

  const handleRemoveStat = (name: string) => {
    onStatsChange(stats.filter((s) => s.name !== name));
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    onInventoryChange([
      ...inventory,
      { id: nanoid(12), name: newItemName.trim() },
    ]);
    setNewItemName("");
  };

  const handleUpdateItem = (
    id: string,
    updates: { name?: string; description?: string },
  ) => {
    onInventoryChange(
      inventory.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    );
  };

  const handleRemoveItem = (id: string) => {
    onInventoryChange(inventory.filter((item) => item.id !== id));
  };

  const handleResetToDefaults = () => {
    const archetypeData = ARCHETYPES[setting]?.find((a) => a.id === archetype);
    if (archetypeData?.defaultStats) {
      onStatsChange(
        archetypeData.defaultStats.map((stat) => ({
          name: resolveMessage(stat.name),
          value: stat.value,
          range: stat.range,
          description: stat.description
            ? resolveMessage(stat.description)
            : undefined,
        })),
      );
    }
    if (archetypeData?.defaultInventory) {
      onInventoryChange(
        archetypeData.defaultInventory.map((item) => ({
          id: nanoid(12),
          name: resolveMessage(item.name),
          description: item.description
            ? resolveMessage(item.description)
            : undefined,
        })),
      );
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <Trans>Configure your character&apos;s stats and inventory</Trans>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetToDefaults}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <Trans>Reset to Default</Trans>
        </Button>
      </div>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stats">
            <Trans>Stats</Trans>
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Trans>Inventory</Trans>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              {t`${stats.length} ${stats.length === 1 ? "stat" : "stats"}`}
            </span>
          </div>

          <div className="flex gap-2 mb-4 items-end">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Name</Trans>
              </span>
              <Input
                placeholder={t`Stat name`}
                value={newStatName}
                onChange={(e) => setNewStatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Current</Trans>
              </span>
              <Input
                type="number"
                value={newStatValue}
                onChange={(e) => setNewStatValue(e.target.value)}
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Max</Trans>
              </span>
              <Input
                type="number"
                value={newStatMax}
                onChange={(e) => setNewStatMax(e.target.value)}
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

          <div className="flex flex-col gap-2">
            {stats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  <Trans>No stats yet</Trans>
                </p>
                <p className="text-xs text-muted-foreground/70">
                  <Trans>Add a stat to track character attributes</Trans>
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
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              {t`${inventory.length} ${inventory.length === 1 ? "item" : "items"}`}
            </span>
          </div>

          <div className="flex gap-2 mb-4 items-end">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Name</Trans>
              </span>
              <Input
                placeholder={t`Add item...`}
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

          <div className="flex flex-col gap-2">
            {inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  <Trans>Inventory empty</Trans>
                </p>
                <p className="text-xs text-muted-foreground/70">
                  <Trans>Items collected will appear here</Trans>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
