import { Textarea } from "@/components/ui/textarea";
import { useTaleStore } from "@/store/useTaleStore";
import { countTokens } from "@/services/llm/tokenCounter";
import { usePersistTale } from "@/hooks/useGameSaves";
import { GameMode } from "@/types";
import { PromptComponentsEditor } from "@/components/prompt-components/PromptComponentsEditor";
import { TALE_COMPONENT_TYPES } from "@/lib/prompt-components";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Segmented,
  SetupSection,
} from "@/components/layout/settings/settings-rows";

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

  const handleGameModeChange = (value: GameMode) => {
    setGameMode(value);
    save(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>AI components</Trans>}>
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
      </SetupSection>

      <SetupSection title={<Trans>Mode</Trans>}>
        <Segmented<GameMode>
          fill
          label={t`Mode`}
          value={gameMode}
          options={[
            {
              value: GameMode.STORY_TELLER,
              label: <Trans>Story Teller</Trans>,
            },
            { value: GameMode.GM, label: <Trans>Game Master</Trans> },
          ]}
          onChange={handleGameModeChange}
        />
        <p className="px-0.5 text-sm text-muted-foreground">
          {gameMode === GameMode.GM ? (
            <Trans>
              The AI also tracks inventory and stats. It needs a model that can
              use tools.
            </Trans>
          ) : (
            <Trans>The AI tells the story. Works with any model.</Trans>
          )}
        </p>
      </SetupSection>

      <SetupSection title={<Trans>Library summary</Trans>}>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          aria-label={t`Library summary`}
        />
        <p className="flex flex-wrap justify-between gap-x-3 px-0.5 text-sm text-muted-foreground">
          <span>
            <Trans>Shown in your library, not sent to the AI.</Trans>
          </span>
          <span className="tabular-nums">
            <Trans>
              {descriptionChars} characters · ~{descriptionTokens} tokens
            </Trans>
          </span>
        </p>
      </SetupSection>
    </div>
  );
}
