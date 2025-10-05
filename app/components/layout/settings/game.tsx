import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui";
import { Separator } from "@/components/ui/separator";
import { GameMode } from "@/types";
import { useSettingsStore, useTaleStore } from "@/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";
import { BookIcon, SwordIcon } from "lucide-react";
import { usePersistTale } from "@/hooks/useGameSaves";

function resolveGameModeLabel(gameMode: GameMode) {
  if (gameMode === GameMode.GM) return "Game Master";
  return "Story Teller";
}

export default function SettingsGame() {
  const { gameMode, setGameMode, id } = useTaleStore();
  const { theme, setTheme } = useTheme();
  const { save } = usePersistTale();
  const { uiScale, setUiScale } = useSettingsStore();

  const getGamemodeDescription = (gameMode: GameMode) => {
    if (gameMode === GameMode.GM)
      return "AI runs the full game: it tells the story, manages inventory, and updates stats. Best with smarter models.";
    return "AI tells the story only: no inventory or stats are tracked, just narrative. Works with any model.";
  };

  const handleGameModeChange = (value: GameMode) => {
    setGameMode(value);
    save(id);
  };

  function getGameModeOptions() {
    return Object.values(GameMode).map((mode) => ({
      label: resolveGameModeLabel(mode),
      value: mode,
    }));
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Label>Game Settings</Label>
      <Separator />

      <Label>Game</Label>
      <Separator />
      <Label>Game Mode</Label>
      <div className="flex flex-col gap-2">
        <Select value={gameMode} onValueChange={handleGameModeChange}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="Select a game mode" />
          </SelectTrigger>
          <SelectContent>
            {getGameModeOptions().map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-row gap-2">
                  {option.value === GameMode.GM && (
                    <SwordIcon className="w-4 h-4" />
                  )}
                  {option.value === GameMode.STORY_TELLER && (
                    <BookIcon className="w-4 h-4" />
                  )}
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {getGamemodeDescription(gameMode)}
        </span>
      </div>

      <Label>Appearance</Label>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Theme</Label>
          <Select
            value={theme}
            onValueChange={(value) =>
              setTheme(value as "light" | "dark" | "system")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>UI Scale (0.8 - 1.5)</Label>
          <div className="flex flex-row items-center gap-2">
            <NumberInput
              min={0.8}
              max={1.5}
              step={0.05}
              value={uiScale}
              onValueCommit={(value) => setUiScale(value)}
              aria-label="User interface scale"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUiScale(1)}
              disabled={Math.abs(uiScale - 1) < 0.01}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
