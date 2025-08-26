import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Stat } from "@/types/stats.type";

export type StatsEditorProps = {
  stats: Stat[];
  onAdd: (name: string) => void;
  onUpdate: (
    prevName: string,
    update: Partial<{ name: string; value: number; rangeMax: number }>,
  ) => void;
  onRemove: (name: string) => void;
};

export function StatsEditor({
  stats,
  onAdd,
  onUpdate,
  onRemove,
}: StatsEditorProps) {
  const [newName, setNewName] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <Label>Initial Stats</Label>
      <div className="flex flex-col gap-3">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="p-3 border rounded-md flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                value={stat.name}
                onChange={(e) => onUpdate(stat.name, { name: e.target.value })}
                className="w-full"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(stat.name)}
              >
                Remove
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <NumberInput
                value={stat.value}
                min={stat.range[0]}
                max={stat.range[1]}
                onValueCommit={(v) => onUpdate(stat.name, { value: v })}
                className="w-24"
              />
              <span>/</span>
              <Label className="text-xs text-muted-foreground">Max</Label>
              <NumberInput
                value={stat.range[1]}
                min={stat.value}
                onValueCommit={(v) => onUpdate(stat.name, { rangeMax: v })}
                className="w-24"
              />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add stat name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAdd(newName);
                setNewName("");
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              onAdd(newName);
              setNewName("");
            }}
          >
            Add Stat
          </Button>
        </div>
      </div>
    </div>
  );
}
