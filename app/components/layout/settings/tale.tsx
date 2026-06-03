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
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";

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
    <SettingsStack>
      <SettingsPanel
        title={<Trans>Tale mode</Trans>}
        description={
          <Trans>Choose how much control the AI has over this tale.</Trans>
        }
      >
        <SettingsField
          label={<Trans>Game Mode</Trans>}
          description={getGamemodeDescription(gameMode)}
        >
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
        </SettingsField>
      </SettingsPanel>

      <SettingsPanel
        title={<Trans>Story context</Trans>}
        description={
          <Trans>
            These notes guide the model while the current tale is running.
          </Trans>
        }
      >
        <SettingsField
          label={
            <div className="flex items-center justify-between gap-3">
              <span>
                <Trans>Description</Trans>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                <Trans>
                  {descriptionChars} characters • ~{descriptionTokens} tokens
                </Trans>
              </span>
            </div>
          }
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
          />
        </SettingsField>

        <SettingsField
          label={
            <div className="flex items-center justify-between gap-3">
              <span>
                <Trans>Author Notes</Trans>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                <Trans>
                  {authorNoteChars} characters • ~{authorNoteTokens} tokens
                </Trans>
              </span>
            </div>
          }
        >
          <Textarea
            value={authorNote}
            onChange={(e) => setAuthorNote(e.target.value)}
            rows={5}
          />
        </SettingsField>
      </SettingsPanel>
    </SettingsStack>
  );
}
