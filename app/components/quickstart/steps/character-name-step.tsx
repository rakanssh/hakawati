import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trans, useLingui } from "@lingui/react/macro";

interface CharacterNameStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function CharacterNameStep({ value, onChange }: CharacterNameStepProps) {
  const { t } = useLingui();
  return (
    <div className="space-y-4 max-w-md mx-auto">
      <p className="text-sm text-muted-foreground text-center">
        <Trans>Give your character a name</Trans>
      </p>

      <div className="space-y-2">
        <Label htmlFor="character-name">
          <Trans>Character Name</Trans>
        </Label>
        <Input
          id="character-name"
          placeholder={t`Enter your character's name...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-lg"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          <Trans>This is how you&apos;ll be known</Trans>
        </p>
      </div>
    </div>
  );
}
