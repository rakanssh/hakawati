import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Stat } from "@/types/stats.type";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";

export type StatsEditorProps = {
  stats: (Stat & { id: string })[];
  onAdd: (name: string) => void;
  onUpdate: (
    id: string,
    update: Partial<{
      name: string;
      description: string | undefined;
      value: number;
      rangeMax: number;
    }>,
  ) => void;
  onRemove: (id: string) => void;
};

export function StatsEditor({
  stats,
  onAdd,
  onUpdate,
  onRemove,
}: StatsEditorProps) {
  const [newName, setNewName] = useState("");
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-2">
      <Label>
        <Trans>Initial Stats</Trans>
      </Label>
      <div className="flex flex-col gap-3">
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="p-3 border rounded-xs flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                value={stat.name}
                onChange={(e) => onUpdate(stat.id, { name: e.target.value })}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRemove(stat.id)}
                className="w-24"
              >
                <Trans>Remove</Trans>
              </Button>
            </div>
            <Input
              value={stat.description || ""}
              onChange={(e) =>
                onUpdate(stat.id, {
                  description: e.target.value || undefined,
                })
              }
              placeholder={t`Description (optional)`}
              className="text-sm text-muted-foreground"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                <Trans>Value</Trans>
              </Label>
              <NumberInput
                value={stat.value}
                min={stat.range[0]}
                max={stat.range[1]}
                onValueCommit={(v) => onUpdate(stat.id, { value: v })}
                className="w-24"
              />
              <span>/</span>
              <Label className="text-xs text-muted-foreground">
                <Trans>Max</Trans>
              </Label>
              <NumberInput
                value={stat.range[1]}
                min={stat.value}
                onValueCommit={(v) => onUpdate(stat.id, { rangeMax: v })}
                className="w-24 rounded-xs"
              />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder={t`Add stat name`}
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
            <Trans>Add Stat</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
