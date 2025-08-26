import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameMode } from "@/types/context.type";

export type GameModeFieldProps = {
  value: GameMode;
  onChange: (value: GameMode) => void;
};

export function GameModeField({ value, onChange }: GameModeFieldProps) {
  function getGameModeOptions() {
    return Object.values(GameMode).map((mode) => ({
      label: mode === GameMode.GM ? "Game Master" : "Story Teller",
      value: mode,
    }));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Initial Game Mode</Label>
      <Select value={value} onValueChange={(v) => onChange(v as GameMode)}>
        <SelectTrigger className="w-full sm:w-[240px]">
          <SelectValue placeholder="Select a game mode" />
        </SelectTrigger>
        <SelectContent>
          {getGameModeOptions().map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
