import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaleStore } from "@/store/useTaleStore";
import { countTokens } from "@/services/llm/tokenCounter";
import { usePersistTale } from "@/hooks/useGameSaves";
import { GameMode } from "@/types";
import { BookIcon, SwordIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

export default function SettingsTale() {
  const { t } = useLingui();
  const {
    description,
    authorNote,
    setDescription,
    setAuthorNote,
    gameMode,
    setGameMode,
    id,
  } = useTaleStore();
  const { save } = usePersistTale();

  const descriptionChars = description.length;
  const descriptionTokens = countTokens(description);
  const authorNoteChars = authorNote.length;
  const authorNoteTokens = countTokens(authorNote);

  const getGamemodeDescription = (gameMode: GameMode) => {
    if (gameMode === GameMode.GM)
      return t`AI runs the full game: it tells the story, manages inventory, and updates stats. Best with smarter models. Requires tool calling to be supported by the model.`;
    return t`AI tells the story only: no inventory or stats are tracked, just narrative. Works with any model.`;
  };

  const handleGameModeChange = (value: GameMode) => {
    setGameMode(value);
    save(id);
  };

  function getGameModeOptions() {
    return Object.values(GameMode).map((mode) => ({
      label: mode === GameMode.GM ? t`Game Master` : t`Story Teller`,
      value: mode,
    }));
  }

  return (
    <div className="flex flex-col gap-4 max-w-full">
      <Label>
        <Trans>Game Mode</Trans>
      </Label>
      <div className="flex flex-col gap-2">
        <Select value={gameMode} onValueChange={handleGameModeChange}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder={t`Select a game mode`} />
          </SelectTrigger>
          <SelectContent>
            {getGameModeOptions().map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-row gap-2">
                  {option.value === GameMode.GM && (
                    <SwordIcon className="w-4 h-4" />
                  )}
                  {option.value === GameMode.STORY_TELLER && (
                    <BookIcon className="w-4 h-4" />
                  )}
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {getGamemodeDescription(gameMode)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            <Trans>Description</Trans>
          </Label>
          <span className="text-xs text-muted-foreground">
            <Trans>
              {descriptionChars} characters • ~{descriptionTokens} tokens
            </Trans>
          </span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            <Trans>Author Notes</Trans>
          </Label>
          <span className="text-xs text-muted-foreground">
            <Trans>
              {authorNoteChars} characters • ~{authorNoteTokens} tokens
            </Trans>
          </span>
        </div>
        <Textarea
          value={authorNote}
          onChange={(e) => setAuthorNote(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );
}
