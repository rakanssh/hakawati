import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CharacterNameStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function CharacterNameStep({ value, onChange }: CharacterNameStepProps) {
  return (
    <div className="space-y-4 max-w-md mx-auto">
      <p className="text-sm text-muted-foreground text-center">
        Give your character a name
      </p>

      <div className="space-y-2">
        <Label htmlFor="character-name">Character Name</Label>
        <Input
          id="character-name"
          placeholder="Enter your character's name..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-lg"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          This is how you&apos;ll be known
        </p>
      </div>
    </div>
  );
}
