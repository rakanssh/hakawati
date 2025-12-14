import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameMode } from "@/types/context.type";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";

export type GameModeFieldProps = {
  value: GameMode;
  onChange: (value: GameMode) => void;
};

export function GameModeField({ value, onChange }: GameModeFieldProps) {
  const { t } = useLingui();
  function getGameModeOptions() {
    return Object.values(GameMode).map((mode) => ({
      label: mode === GameMode.GM ? t`Game Master` : t`Story Teller`,
      value: mode,
    }));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        <Trans>Initial Game Mode</Trans>
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as GameMode)}>
        <SelectTrigger className="w-full sm:w-[240px] rounded-xs">
          <SelectValue placeholder={t`Select a game mode`} />
        </SelectTrigger>
        <SelectContent className="rounded-xs">
          {getGameModeOptions().map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="rounded-xs"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
