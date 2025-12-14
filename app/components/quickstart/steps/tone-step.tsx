import { TONES, getRandomElement } from "@/data/quickstart-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shuffle } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

interface ToneStepProps {
  value: string;
  onChange: (value: string) => void;
  onNext?: () => void;
}

export function ToneStep({ value, onChange, onNext }: ToneStepProps) {
  const { t } = useLingui();

  const handleSurpriseMe = () => {
    const randomTone = getRandomElement(TONES);
    onChange(randomTone.id);
    if (onNext) {
      onNext();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <Trans>Set the narrative tone for your story</Trans>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSurpriseMe}
          className="gap-2"
        >
          <Shuffle className="w-4 h-4" />
          <Trans>Surprise Me</Trans>
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {TONES.map((tone) => {
          const isSelected = value === tone.id;
          return (
            <Card
              key={tone.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary ring-offset-2"
                  : "hover:border-primary/50"
              }`}
              onClick={() => onChange(tone.id)}
            >
              <CardContent className="p-4">
                <h3 className="font-semibold mb-1">{t(tone.name)}</h3>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          <Trans>
            💡 Tip: You can always adjust the tone later by editing the author
            note
          </Trans>
        </p>
      </div>
    </div>
  );
}
