import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaleStore } from "@/store/useTaleStore";
import { Plus, Trash2, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SettingsStats() {
  const { stats, addToStats, removeFromStats, updateStat } = useTaleStore();
  const [newStatName, setNewStatName] = useState("");
  const [newStatDescription, setNewStatDescription] = useState("");
  const [newStatValue, setNewStatValue] = useState("50");
  const [newStatMax, setNewStatMax] = useState("100");

  const handleAddStat = () => {
    if (!newStatName.trim()) return;
    const value = Number.parseInt(newStatValue) || 50;
    const max = Number.parseInt(newStatMax) || 100;
    addToStats({
      name: newStatName.trim(),
      description: newStatDescription.trim() || undefined,
      value,
      range: [0, max],
    });
    setNewStatName("");
    setNewStatDescription("");
    setNewStatValue("50");
    setNewStatMax("100");
  };

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Activity className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">No stats defined yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stats.map((stat) => {
            const percentage = (stat.value / stat.range[1]) * 100;
            return (
              <div
                key={stat.name}
                className="group p-4 rounded-xs border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Input
                    value={stat.name}
                    onChange={(e) =>
                      updateStat(stat.name, { name: e.target.value })
                    }
                    className="font-medium bg-transparent border-none px-0 h-auto text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromStats(stat.name)}
                    className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <Input
                  value={stat.description || ""}
                  onChange={(e) =>
                    updateStat(stat.name, {
                      description: e.target.value || undefined,
                    })
                  }
                  placeholder="Description (optional)"
                  className="mb-3 h-8 text-sm text-muted-foreground bg-transparent border-dashed"
                />

                <div className="space-y-2">
                  <Progress value={percentage} className="h-2" />
                  <div className="flex items-center gap-2 text-sm">
                    <Input
                      type="number"
                      value={stat.value}
                      onChange={(e) =>
                        updateStat(stat.name, {
                          value: Number.parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-16 h-7 text-center text-xs"
                    />
                    <span className="text-muted-foreground">/</span>
                    <Input
                      type="number"
                      value={stat.range[1]}
                      onChange={(e) =>
                        updateStat(stat.name, {
                          range: [
                            stat.range[0],
                            Number.parseInt(e.target.value) || 100,
                          ],
                        })
                      }
                      className="w-16 h-7 text-center text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 p-3 rounded-xs border border-dashed">
        <div className="flex items-center gap-2">
          <Input
            value={newStatName}
            onChange={(e) => setNewStatName(e.target.value)}
            placeholder="New stat name"
            onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
            className="flex-1"
          />
          <Input
            type="number"
            value={newStatValue}
            onChange={(e) => setNewStatValue(e.target.value)}
            placeholder="Value"
            onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
            className="w-20"
          />
          <Input
            type="number"
            value={newStatMax}
            onChange={(e) => setNewStatMax(e.target.value)}
            placeholder="Max"
            onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
            className="w-20"
          />
          <Button
            size="icon"
            onClick={handleAddStat}
            disabled={!newStatName.trim()}
            className="shrink-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <Input
          value={newStatDescription}
          onChange={(e) => setNewStatDescription(e.target.value)}
          placeholder="Description (optional)"
          onKeyDown={(e) => e.key === "Enter" && handleAddStat()}
          className="text-sm"
        />
      </div>
    </div>
  );
}
