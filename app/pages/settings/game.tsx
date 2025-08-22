import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GameMode } from "@/types";
import { useGameStore } from "@/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function resolveGameModeLabel(gameMode: GameMode) {
  if (gameMode === GameMode.GM) return "Game Master";
  return "Story Teller";
}

export default function SettingsGame() {
  const { gameMode, setGameMode } = useGameStore();

  function getGameModeOptions() {
    return Object.values(GameMode).map((mode) => ({
      label: resolveGameModeLabel(mode),
      value: mode,
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Label>Game Settings</Label>
      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Game Mode</Label>
        <Select value={gameMode} onValueChange={setGameMode}>
          <SelectTrigger>
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
    </div>
  );
}
