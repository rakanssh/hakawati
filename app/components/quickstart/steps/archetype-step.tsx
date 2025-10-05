import { ARCHETYPES, getRandomElement } from "@/data/quickstart-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shuffle } from "lucide-react";
import { GameMode } from "@/types";

interface ArchetypeStepProps {
  setting: string;
  value: string;
  customValue: string;
  gameMode: GameMode;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
}

export function ArchetypeStep({
  setting,
  value,
  customValue,
  gameMode,
  onChange,
  onCustomChange,
}: ArchetypeStepProps) {
  const baseArchetypes = ARCHETYPES[setting] || ARCHETYPES.custom;

  const customArchetype = {
    id: "custom-archetype",
    name: "Custom",
    description: "Define your own unique character archetype",
    defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
    defaultInventory: [],
  };

  const archetypes = [
    ...baseArchetypes.filter((a) => a.id !== "custom-archetype"),
    customArchetype,
  ];

  const handleSurpriseMe = () => {
    const nonCustomArchetypes = archetypes.filter(
      (a) => a.id !== "custom-archetype",
    );
    if (nonCustomArchetypes.length > 0) {
      const randomArchetype = getRandomElement(nonCustomArchetypes);
      onChange(randomArchetype.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Choose your character archetype
        </p>
        {archetypes.some((a) => a.id !== "custom-archetype") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSurpriseMe}
            className="gap-2"
          >
            <Shuffle className="w-4 h-4" />
            Surprise Me
          </Button>
        )}
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {archetypes.map((archetype) => {
          const isSelected = value === archetype.id;
          return (
            <Card
              key={archetype.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary ring-offset-2"
                  : "hover:border-primary/50"
              }`}
              onClick={() => onChange(archetype.id)}
            >
              <CardContent className="p-4">
                <h3 className="font-semibold mb-1">{archetype.name}</h3>

                {gameMode === GameMode.GM &&
                  archetype.defaultStats &&
                  archetype.defaultStats.length > 0 && (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <p className="text-xs text-muted-foreground">Stats:</p>
                        {archetype.defaultStats.slice(0, 3).map((stat) => (
                          <span
                            key={stat.name}
                            className="text-xs px-2 py-0.5 rounded-full bg-muted"
                          >
                            {stat.name}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <p className="text-xs text-muted-foreground">
                          Inventory:
                        </p>
                        {archetype.defaultInventory?.slice(0, 3).map((item) => (
                          <span
                            key={item}
                            className="text-xs px-2 py-0.5 rounded-full bg-muted"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {value === "custom-archetype" && (
        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="custom-archetype">Custom Archetype</Label>
          <Input
            id="custom-archetype"
            placeholder="e.g., Wandering Bard, Cyborg Assassin..."
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Describe your character&apos;s role
          </p>
        </div>
      )}
    </div>
  );
}
