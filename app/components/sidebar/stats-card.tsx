import { useTaleStore } from "@/store/useTaleStore";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { InlineEditableBadge } from "./inline-editable-badge";
import { InlineEditableNumber } from "./inline-editable-number";
import { Stat } from "@/types/stats.type";
import { AddIconButton } from "./add-icon-button";
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

function ProgressBar({ stat }: { stat: Stat }) {
  const progress = (stat.value / stat.range[1]) * 100;
  return <Progress value={progress} max={100} className="h-2 mt-1" />;
}

const StatsButton = ({ setOpen }: { setOpen: (open: boolean) => void }) => (
  <AddIconButton onClick={() => setOpen(true)} ariaLabel="Add stat" />
);

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
      <div className="px-1 flex-shrink-0 pt-1 mt-1">
        <div className="relative flex flex-row justify-between">
          <div className="absolute end-0">
            <StatsButton setOpen={setOpen} />
          </div>
          <Label className="text-sm pb-1">
            <Trans>Stats</Trans>
          </Label>
        </div>
        <Separator className="mb-1" />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-1 pb-1">
          {stats.length === 0 ? (
            <Label className="text-muted-foreground text-xs">
              <Trans>Nothing...</Trans>
            </Label>
          ) : (
            <div className="flex flex-col gap-4">
              {stats.map((stat) => (
                <div key={stat.name} className="flex flex-col gap-1">
                  <div className="flex flex-row justify-between items-baseline">
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
                      className="cursor-pointer border-primary/35 text-wrap whitespace-normal text-start"
                    />
                    <div className="flex items-baseline gap-1">
                      <InlineEditableNumber
                        value={stat.value}
                        min={stat.range[0]}
                        max={stat.range[1]}
                        step={1}
                        onChange={(newValue) =>
                          updateStat(stat.name, { value: newValue })
                        }
                      />
                      /
                      <InlineEditableNumber
                        value={stat.range[1]}
                        min={stat.value}
                        step={1}
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
