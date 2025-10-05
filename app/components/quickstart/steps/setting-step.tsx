import { SETTINGS, getRandomElement } from "@/data/quickstart-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shuffle } from "lucide-react";

interface SettingStepProps {
  value: string;
  customValue: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
}

export function SettingStep({
  value,
  customValue,
  onChange,
  onCustomChange,
}: SettingStepProps) {
  const handleSurpriseMe = () => {
    const nonCustomSettings = SETTINGS.filter((s) => s.id !== "custom");
    const randomSetting = getRandomElement(nonCustomSettings);
    onChange(randomSetting.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select a world for your story
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSurpriseMe}
          className="gap-2"
        >
          <Shuffle className="w-4 h-4" />
          Surprise Me
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        {SETTINGS.map((setting) => {
          const isSelected = value === setting.id;
          return (
            <Card
              key={setting.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary ring-offset-2"
                  : "hover:border-primary/50"
              }`}
              onClick={() => onChange(setting.id)}
            >
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="text-3xl mb-2">{setting.icon}</div>
                  <h3 className="font-semibold text-sm mb-1">{setting.name}</h3>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {value === "custom" && (
        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="custom-setting">Custom Setting</Label>
          <Input
            id="custom-setting"
            placeholder="e.g., Steampunk, Space Opera, etc."
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Describe the world</p>
        </div>
      )}
    </div>
  );
}
