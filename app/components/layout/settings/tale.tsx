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
import { PromptComponentsEditor } from "@/components/prompt-components/PromptComponentsEditor";
import { TALE_COMPONENT_TYPES } from "@/lib/prompt-components";
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
    components,
    setDescription,
    addComponent,
    updateComponent,
    removeComponent,
    gameMode,
    setGameMode,
    id,
  } = useTaleStore();
  const { save } = usePersistTale();

  const descriptionChars = description.length;
  const descriptionTokens = countTokens(description);

  const getGamemodeDescription = (mode: GameMode) => {
    if (mode === GameMode.GM)
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

      <SettingsPanel title={<Trans>Description</Trans>}>
        <SettingsField
          label={
            <div className="flex items-center justify-between gap-3">
              <span>
                <Trans>Library summary</Trans>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                <Trans>
                  {descriptionChars} characters • ~{descriptionTokens} tokens
                </Trans>
              </span>
            </div>
          }
          description={
            <Trans>
              A short library-facing summary. It is not sent to the AI.
            </Trans>
          }
        >
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
          />
        </SettingsField>
      </SettingsPanel>

      <SettingsPanel title={<Trans>AI Components</Trans>}>
        <PromptComponentsEditor
          components={components}
          allowedTypes={TALE_COMPONENT_TYPES}
          gameMode={gameMode}
          showTitle={false}
          description={
            <Trans>These optional components are sent to the AI.</Trans>
          }
          onAdd={addComponent}
          onUpdate={updateComponent}
          onRemove={removeComponent}
        />
      </SettingsPanel>
    </SettingsStack>
  );
}
