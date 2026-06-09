import { useTaleStore } from "@/store/useTaleStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { InlineEditableBadge } from "./inline-editable-badge";
import { InlineEditableNumber } from "./inline-editable-number";
import { Stat } from "@/types/stats.type";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  SidebarSectionHeader,
  sidebarChipClass,
  sidebarEmptyLabelClass,
} from "./sidebar-section";

function ProgressBar({ stat }: { stat: Stat }) {
  const progress = (stat.value / stat.range[1]) * 100;
  return (
    <Progress
      value={progress}
      max={100}
      className="mt-1.5 h-2.5 bg-sidebar-accent/55 dark:bg-sidebar-foreground/12"
    />
  );
}

export function StatsCard({ className }: { className?: string }) {
  const { stats, addToStats, updateStat, removeFromStats } = useTaleStore();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currentValue, setCurrentValue] = useState("0");
  const [maxValue, setMaxValue] = useState("100");

  const nameExists = (candidate: string) =>
    stats.some((s) => s.name.toLowerCase() === candidate.trim().toLowerCase());
  const canSubmit = name.trim() && !nameExists(name) && maxValue.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    const max = parseInt(maxValue) || 100;
    const current = parseInt(currentValue) || 0;
    addToStats({
      name: name.trim(),
      description: description.trim() || undefined,
      value: Math.min(Math.max(current, 0), max),
      range: [0, max],
    });
    setName("");
    setDescription("");
    setCurrentValue("0");
    setMaxValue("100");
    setOpen(false);
  };

  return (
    <div className={cn("relative flex flex-col overflow-hidden", className)}>
      <SidebarSectionHeader
        actionLabel={t`Add stat`}
        onAction={() => setOpen(true)}
      >
        <Trans>Stats</Trans>
      </SidebarSectionHeader>
      <ScrollArea className="flex-1 min-h-0">
        <div className="pt-3 pb-1">
          {stats.length === 0 ? (
            <Label className={sidebarEmptyLabelClass}>
              <Trans>Nothing...</Trans>
            </Label>
          ) : (
            <div className="flex flex-col gap-4">
              {stats.map((stat) => (
                <div key={stat.name} className="flex flex-col gap-1.5">
                  <div className="flex flex-row items-center justify-between gap-3">
                    <InlineEditableBadge
                      label={stat.name}
                      onRename={(newName) => {
                        if (
                          nameExists(newName) &&
                          newName.trim().toLowerCase() !==
                            stat.name.toLowerCase()
                        ) {
                          return;
                        }
                        updateStat(stat.name, { name: newName.trim() });
                      }}
                      onRemove={() => removeFromStats(stat.name)}
                      className={sidebarChipClass}
                    />
                    <div className="flex shrink-0 items-baseline gap-1 text-sm text-sidebar-foreground/65">
                      <InlineEditableNumber
                        value={stat.value}
                        min={stat.range[0]}
                        max={stat.range[1]}
                        step={1}
                        className="font-mono text-sidebar-foreground/80 hover:text-sidebar-foreground"
                        onChange={(newValue) =>
                          updateStat(stat.name, { value: newValue })
                        }
                      />
                      <span>/</span>
                      <InlineEditableNumber
                        value={stat.range[1]}
                        min={stat.value}
                        step={1}
                        className="font-mono text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        onChange={(newValue) =>
                          updateStat(stat.name, {
                            range: [stat.range[0], newValue],
                          })
                        }
                      />
                    </div>
                  </div>
                  <ProgressBar stat={stat} />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Add Stat</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Create a new stat with initial and maximum values.</Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
              <Label htmlFor="stat-name">
                <Trans>Name</Trans>
              </Label>
              <Input
                id="stat-name"
                placeholder={t`Stat name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="stat-current">
                  <Trans>Current Value</Trans>
                </Label>
                <Input
                  id="stat-current"
                  type="number"
                  placeholder={t`0`}
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="stat-max">
                  <Trans>Maximum Value</Trans>
                </Label>
                <Input
                  id="stat-max"
                  type="number"
                  placeholder={t`100`}
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="stat-description">
                <Trans>Description (optional)</Trans>
              </Label>
              <Input
                id="stat-description"
                placeholder={t`Add context for the AI...`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              <PlusIcon className="w-4 h-4 me-2" />
              <Trans>Add Stat</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
