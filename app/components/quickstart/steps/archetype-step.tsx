import { ARCHETYPES, getRandomElement } from "@/data/quickstart-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shuffle } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";

interface ArchetypeStepProps {
  setting: string;
  value: string;
  customValue: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  onNext?: () => void;
}

export function ArchetypeStep({
  setting,
  value,
  customValue,
  onChange,
  onCustomChange,
  onNext,
}: ArchetypeStepProps) {
  const { t } = useLingui();
  const baseArchetypes = ARCHETYPES[setting] || ARCHETYPES.custom;

  const customArchetype = {
    id: "custom-archetype",
    name: msg`Custom`,
    description: "Define your own unique character archetype",
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
      if (onNext) {
        onNext();
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <Trans>Choose your character archetype</Trans>
        </p>
        {archetypes.some((a) => a.id !== "custom-archetype") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSurpriseMe}
            className="gap-2"
          >
            <Shuffle className="w-4 h-4" />
            <Trans>Surprise Me</Trans>
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
                <h3 className="font-semibold mb-1">{t(archetype.name)}</h3>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {value === "custom-archetype" && (
        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="custom-archetype">
            <Trans>Custom Archetype</Trans>
          </Label>
          <Input
            id="custom-archetype"
            placeholder={t`e.g., Soldier, Sapient Potato, etc.`}
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            <Trans>Describe your character&apos;s role</Trans>
          </p>
        </div>
      )}
    </div>
  );
}
