import { GameMode } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Swords, BookOpen } from "lucide-react";

interface GameModeStepProps {
  value: GameMode;
  onChange: (value: GameMode) => void;
}

export function GameModeStep({ value, onChange }: GameModeStepProps) {
  const modes = [
    {
      id: GameMode.STORY_TELLER,
      name: "Story Teller",
      description: "Pure narrative freedom without game mechanics",
      icon: BookOpen,
      features: [
        "Pure storytelling",
        "No stats or inventory tracking",
        "Works with all models",
      ],
    },
    {
      id: GameMode.GM,
      name: "Game Master (GM)",
      description:
        "The AI acts as a Game Master, tracking stats and inventory [Experimental]",
      icon: Swords,
      features: [
        "Stats and inventory tracking",
        "Structured gameplay",
        "Best with more capable models",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose your game mode</p>
      <div className="grid gap-4 md:grid-cols-2">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = value === mode.id;
          return (
            <Card
              key={mode.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary ring-offset-2"
                  : "hover:border-primary/50"
              }`}
              onClick={() => onChange(mode.id)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <Icon
                    className={`w-8 h-8 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{mode.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {mode.description}
                    </p>
                    <ul className="space-y-1">
                      {mode.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="text-xs flex items-center gap-2"
                        >
                          <span
                            className={`w-1 h-1 rounded-full ${isSelected ? "bg-primary" : "bg-muted-foreground"}`}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
