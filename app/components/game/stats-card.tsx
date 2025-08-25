import { useTaleStore } from "@/store/useTaleStore";
import { Separator } from "../ui/separator";
import { Progress } from "../ui/progress";
// Button not used directly after AddIconButton extraction
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { AddDrawer } from "./add-drawer";
import { Input } from "../ui/input";
import { InlineEditableBadge } from "./inline-editable-badge";
import { InlineEditableNumber } from "./inline-editable-number";
import { Stat } from "@/types/stats.type";
import { AddIconButton } from "./add-icon-button";
import { Label } from "../ui/label";

function ProgressBar({ stat }: { stat: Stat }) {
  const progress = (stat.value / stat.range[1]) * 100;
  return <Progress value={progress} max={100} className="h-2 mt-1" />;
}
export function StatsCard() {
  const { stats, addToStats, updateStat, removeFromStats } = useTaleStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const nameExists = (candidate: string) =>
    stats.some((s) => s.name.toLowerCase() === candidate.trim().toLowerCase());
  const canSubmit = name.trim() && !nameExists(name);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <div className="py-1 flex flex-col gap-1 mt-1">
        <div className="px-1">
          <div className="relative flex flex-row justify-between">
            <div className="absolute right-0">
              <AddIconButton
                onClick={() => setOpen(true)}
                ariaLabel="Add stat"
              />
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
                    className="cursor-pointer border-white/35 text-wrap whitespace-normal text-left rounded-xs"
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
        <AddDrawer
          open={open}
          setOpen={(o) => {
            setOpen(o);
            if (!o) {
              setName("");
            }
          }}
          containerRef={containerRef}
          onSubmit={() => {
            if (!canSubmit) return;
            addToStats({ name: name.trim(), value: 0, range: [0, 100] });
            setName("");
          }}
          submitDisabled={!canSubmit}
          submitIcon={<PlusIcon className="w-4 h-4" />}
          submitAriaLabel="Add stat"
        >
          <div className="flex gap-2 w-full">
            <Input
              placeholder="Stat name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </AddDrawer>
      </div>
    </div>
  );
}
