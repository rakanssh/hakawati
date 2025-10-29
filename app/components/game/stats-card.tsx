import { useTaleStore } from "@/store/useTaleStore";
import { Separator } from "../ui/separator";
import { Progress } from "../ui/progress";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "../ui/input";
import { InlineEditableBadge } from "./inline-editable-badge";
import { InlineEditableNumber } from "./inline-editable-number";
import { Stat } from "@/types/stats.type";
import { AddIconButton } from "./add-icon-button";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

function ProgressBar({ stat }: { stat: Stat }) {
  const progress = (stat.value / stat.range[1]) * 100;
  return <Progress value={progress} max={100} className="h-2 mt-1" />;
}

const StatsButton = ({ setOpen }: { setOpen: (open: boolean) => void }) => (
  <AddIconButton onClick={() => setOpen(true)} ariaLabel="Add stat" />
);

export function StatsCard() {
  const { stats, addToStats, updateStat, removeFromStats } = useTaleStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
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
      value: Math.min(Math.max(current, 0), max),
      range: [0, max],
    });
    setName("");
    setCurrentValue("0");
    setMaxValue("100");
    setOpen(false);
  };

  return (
    <div className="relative overflow-hidden">
      <div className="py-1 flex flex-col gap-1 mt-1">
        <div className="px-1">
          <div className="relative flex flex-row justify-between">
            <div className="absolute right-0">
              <StatsButton setOpen={setOpen} />
            </div>
            <Label className="text-sm pb-1">Stats</Label>
          </div>
          <Separator className="mb-1" />
        </div>
        <div className="px-1">
          <div className="flex flex-col gap-4">
            {stats.map((stat) => (
              <div key={stat.name} className="flex flex-col gap-1">
                <div className="flex flex-row justify-between items-baseline">
                  <InlineEditableBadge
                    label={stat.name}
                    onRename={(newName) => {
                      if (
                        nameExists(newName) &&
                        newName.trim().toLowerCase() !== stat.name.toLowerCase()
                      ) {
                        return;
                      }
                      updateStat(stat.name, { name: newName.trim() });
                    }}
                    onRemove={() => removeFromStats(stat.name)}
                    className="cursor-pointer border-white/35 text-wrap whitespace-normal text-left"
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
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stat</DialogTitle>
            <DialogDescription>
              Create a new stat with initial and maximum values.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
              <Label htmlFor="stat-name">Name</Label>
              <Input
                id="stat-name"
                placeholder="Stat name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="stat-current">Current Value</Label>
                <Input
                  id="stat-current"
                  type="number"
                  placeholder="0"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="stat-max">Maximum Value</Label>
                <Input
                  id="stat-max"
                  type="number"
                  placeholder="100"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Stat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
