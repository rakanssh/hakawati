import { GameMode } from "@/types";
import { Swords, BookOpen } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

interface GameModeStepProps {
  value: GameMode;
  onChange: (value: GameMode) => void;
}

export function GameModeStep({ value, onChange }: GameModeStepProps) {
  const { t } = useLingui();
  const modes = [
    {
      id: GameMode.STORY_TELLER,
      name: t`Story Teller`,
      description: t`Pure narrative freedom without game mechanics`,
      icon: BookOpen,
      features: [
        t`Pure storytelling`,
        t`No stats or inventory tracking`,
        t`Works with all models`,
      ],
    },
    {
      id: GameMode.GM,
      name: t`Game Master (GM)`,
      description: t`The AI acts as a Game Master, tracking stats and inventory`,
      icon: Swords,
      features: [
        t`Stats and inventory tracking`,
        t`Structured gameplay`,
        t`Best with more capable models. Requires tool calling.`,
      ],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = value === mode.id;
          return (
            <button
              type="button"
              key={mode.id}
              className={cn(
                "relative overflow-hidden rounded-xs border bg-card/55 p-5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:bg-card/80 hover:shadow-md focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/35"
                  : "border-border/70",
              )}
              onClick={() => onChange(mode.id)}
            >
              {mode.id === GameMode.GM && (
                <div className="absolute top-0 right-0 overflow-hidden w-24 h-24 pointer-events-none">
                  <div className="absolute top-4.5 -right-6 w-28 rotate-45 bg-log-thinking py-1 text-center text-[9.5px] font-bold text-log-thinking-foreground shadow-sm">
                    &nbsp;&nbsp;&nbsp;{t`EXPERIMENTAL`}
                  </div>
                </div>
              )}
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
                      <li key={idx} className="text-xs flex items-center gap-2">
                        <span
                          className={`w-1 h-1 rounded-full ${isSelected ? "bg-primary" : "bg-muted-foreground"}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
