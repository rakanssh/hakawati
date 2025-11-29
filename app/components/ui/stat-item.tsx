import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import type { Stat } from "@/types/stats.type";

interface StatItemProps {
  stat: Stat;
  onUpdate: (name: string, updates: Partial<Stat>) => void;
  onRemove: (name: string) => void;
}

export function StatItem({ stat, onUpdate, onRemove }: StatItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(stat.value);
  const [editMax, setEditMax] = useState(stat.range[1]);

  const percentage =
    ((stat.value - stat.range[0]) / (stat.range[1] - stat.range[0])) * 100;

  const handleSave = () => {
    onUpdate(stat.name, {
      value: Math.min(Math.max(editValue, 0), editMax),
      range: [0, editMax],
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(stat.value);
    setEditMax(stat.range[1]);
    setIsEditing(false);
  };

  return (
    <div className="group relative flex flex-col gap-2 rounded-xs border bg-card/50 p-3 transition-colors hover:bg-card overflow-hidden">
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">{stat.name}</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Current</span>
              <Input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Max</span>
              <Input
                type="number"
                value={editMax}
                onChange={(e) => setEditMax(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm truncate min-w-[4rem] max-w-[8rem]">
            {stat.name}
          </span>
          <Progress value={percentage} className="flex-1 h-2" />
          <span className="text-xs text-muted-foreground tabular-nums min-w-[4rem] text-right">
            {stat.value} / {stat.range[1]}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsEditing(true)}
              className="h-6 w-6"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(stat.name)}
              className="h-6 w-6 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
