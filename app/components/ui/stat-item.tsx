import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import type { Stat } from "@/types/stats.type";
import { Trans, useLingui } from "@lingui/react/macro";

interface StatItemProps {
  stat: Stat;
  onUpdate: (name: string, updates: Partial<Stat>) => void;
  onRemove: (name: string) => void;
}

export function StatItem({ stat, onUpdate, onRemove }: StatItemProps) {
  const { t } = useLingui();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stat.name);
  const [editValue, setEditValue] = useState(stat.value);
  const [editMax, setEditMax] = useState(stat.range[1]);
  const [editDescription, setEditDescription] = useState(
    stat.description || "",
  );

  const percentage =
    ((stat.value - stat.range[0]) / (stat.range[1] - stat.range[0])) * 100;

  const handleSave = () => {
    if (!editName.trim()) return;
    onUpdate(stat.name, {
      name: editName.trim(),
      value: Math.min(Math.max(editValue, 0), editMax),
      range: [0, editMax],
      description: editDescription.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(stat.name);
    setEditValue(stat.value);
    setEditMax(stat.range[1]);
    setEditDescription(stat.description || "");
    setIsEditing(false);
  };

  return (
    <div className="group relative flex flex-col gap-2 rounded-xs border bg-card/50 p-3 transition-colors hover:bg-card overflow-hidden">
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              <Trans>Name</Trans>
            </span>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t`Stat name`}
              className="h-8 text-sm font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Current</Trans>
              </span>
              <Input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                <Trans>Max</Trans>
              </span>
              <Input
                type="number"
                value={editMax}
                onChange={(e) => setEditMax(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              <Trans>Description</Trans>
            </span>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t`Add context for the AI...`}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3 w-3 me-1" />
              <Trans>Cancel</Trans>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editName.trim()}>
              <Check className="h-3 w-3 me-1" />
              <Trans>Save</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm truncate min-w-[4rem] max-w-[8rem]">
              {stat.name}
            </span>
            <Progress value={percentage} className="flex-1 h-2" />
            <span className="text-xs text-muted-foreground tabular-nums min-w-[4rem] text-end">
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
          {stat.description && (
            <span className="text-xs text-muted-foreground ps-1">
              {stat.description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
