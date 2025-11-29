import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/store";
import { useTheme } from "@/components/theme-provider";
import { FontSelector } from "./font-selector";

export default function SettingsGame() {
  const { theme, setTheme } = useTheme();
  const { uiScale, setUiScale, fontSize, setFontSize } = useSettingsStore();

  return (
    <div className="flex flex-col gap-4 max-w-full">
      <Label>Appearance</Label>

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
      <div className="flex flex-col gap-2">
        <Label>Font Size (0.75 - 2.0)</Label>
        <div className="flex flex-row items-center gap-2">
          <NumberInput
            min={0.75}
            max={2}
            step={0.05}
            value={fontSize}
            onValueCommit={(value) => setFontSize(value)}
            aria-label="Game log font size"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFontSize(1)}
            disabled={Math.abs(fontSize - 1) < 0.01}
          >
            Reset
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Font Family</Label>
        <FontSelector />
      </div>
    </div>
  );
}
