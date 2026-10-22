import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store";
import {
  AI_INSTRUCTIONS_PROMPT,
  GM_SYSTEM_PROMPT,
  CONTINUE_SYSTEM_PROMPT,
  CONTINUE_AUTHOR_NOTE,
  STORY_CARD_GENERATOR_PROMPT,
} from "@/prompts";
import { useSettingsNavigation, useSettingsWindow } from "./settings-shell";
import {
  LinkRow,
  RowText,
  Segmented,
  SetupList,
  useRowClass,
} from "./settings-rows";

type PromptId =
  | "instructions"
  | "continue"
  | "author-note"
  | "gm"
  | "story-cards";

const PROMPT_IDS: PromptId[] = [
  "instructions",
  "continue",
  "author-note",
  "gm",
  "story-cards",
];

const pageOf = (id: PromptId) => `prompt:${id}`;

function PromptName({ id }: { id: PromptId }) {
  switch (id) {
    case "instructions":
      return <Trans>AI instructions</Trans>;
    case "continue":
      return <Trans>Continue</Trans>;
    case "author-note":
      return <Trans>Continue author note</Trans>;
    case "gm":
      return <Trans>Game Master mechanics</Trans>;
    case "story-cards":
      return <Trans>Story card generator</Trans>;
  }
}

function PromptUsage({ id }: { id: PromptId }) {
  switch (id) {
    case "instructions":
      return (
        <Trans>Used by tales and scenarios that don’t set their own.</Trans>
      );
    case "continue":
      return <Trans>Sent as your turn when you continue the story.</Trans>;
    case "author-note":
      return (
        <Trans>
          Added near the end of the prompt when you continue the story.
        </Trans>
      );
    case "gm":
      return (
        <Trans>Added in Game Master mode to explain the game’s tools.</Trans>
      );
    case "story-cards":
      return <Trans>Used when generating story cards.</Trans>;
  }
}

function PromptWarning({ id }: { id: PromptId }) {
  switch (id) {
    case "gm":
      return (
        <Trans>
          Game Master mode is still in development and sensitive to this prompt.
        </Trans>
      );
    case "story-cards":
      return (
        <Trans>
          The reply is read as JSON with content, triggers, and category. Keep
          that format if you change it.
        </Trans>
      );
    default:
      return null;
  }
}

/** One prompt's saved text, whether it's in use, and its built-in default. */
function usePrompt(id: PromptId) {
  const state = useSettingsStore();
  switch (id) {
    case "instructions":
      return {
        text: state.customStorytellerPrompt,
        custom: state.useCustomStorytellerPrompt,
        setText: state.setCustomStorytellerPrompt,
        setCustom: state.setUseCustomStorytellerPrompt,
        reset: state.resetStorytellerPrompt,
        defaultText: AI_INSTRUCTIONS_PROMPT,
      };
    case "continue":
      return {
        text: state.customContinuePrompt,
        custom: state.useCustomContinuePrompt,
        setText: state.setCustomContinuePrompt,
        setCustom: state.setUseCustomContinuePrompt,
        reset: state.resetContinuePrompt,
        defaultText: CONTINUE_SYSTEM_PROMPT,
      };
    case "author-note":
      return {
        text: state.customContinueAuthorNote,
        custom: state.useCustomContinueAuthorNote,
        setText: state.setCustomContinueAuthorNote,
        setCustom: state.setUseCustomContinueAuthorNote,
        reset: state.resetContinueAuthorNote,
        defaultText: CONTINUE_AUTHOR_NOTE,
      };
    case "gm":
      return {
        text: state.customGmPrompt,
        custom: state.useCustomGmPrompt,
        setText: state.setCustomGmPrompt,
        setCustom: state.setUseCustomGmPrompt,
        reset: state.resetGmPrompt,
        defaultText: GM_SYSTEM_PROMPT,
      };
    case "story-cards":
      return {
        text: state.customStoryCardGeneratorPrompt,
        custom: state.useCustomStoryCardGeneratorPrompt,
        setText: state.setCustomStoryCardGeneratorPrompt,
        setCustom: state.setUseCustomStoryCardGeneratorPrompt,
        reset: state.resetStoryCardGeneratorPrompt,
        defaultText: STORY_CARD_GENERATOR_PROMPT,
      };
  }
}

interface PromptSelection {
  selected: PromptId;
  onSelect: (id: PromptId) => void;
}

/** Opens a prompt's page, or beside the editor, picks the prompt it shows. */
function PromptRow({
  id,
  selection,
}: {
  id: PromptId;
  selection?: PromptSelection;
}) {
  const navigation = useSettingsNavigation();
  const rowClass = useRowClass({ interactive: true });
  const { custom } = usePrompt(id);
  const status = custom ? (
    <span className="sidebar-chip shrink-0 rounded-xs border border-primary/55 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
      <Trans>Custom</Trans>
    </span>
  ) : (
    <span className="shrink-0 text-sm text-muted-foreground">
      <Trans>Default</Trans>
    </span>
  );

  if (selection) {
    const selected = selection.selected === id;
    return (
      <button
        type="button"
        aria-current={selected || undefined}
        className={cn(rowClass, selected && "bg-primary/10")}
        onClick={() => selection.onSelect(id)}
      >
        <RowText title={<PromptName id={id} />} />
        {status}
      </button>
    );
  }
  return (
    <LinkRow
      title={<PromptName id={id} />}
      trailing={status}
      onClick={() => navigation.push(pageOf(id))}
    />
  );
}

function PromptList({ selection }: { selection?: PromptSelection }) {
  const anyCustom = useSettingsStore(
    (state) =>
      state.useCustomGmPrompt ||
      state.useCustomStorytellerPrompt ||
      state.useCustomContinuePrompt ||
      state.useCustomContinueAuthorNote ||
      state.useCustomStoryCardGeneratorPrompt,
  );
  const resetAll = useSettingsStore((state) => state.resetAllPromptsToDefault);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <SetupList>
        {PROMPT_IDS.map((id) => (
          <PromptRow key={id} id={id} selection={selection} />
        ))}
      </SetupList>
      {anyCustom ? (
        <Button
          variant="ghost"
          className="self-start px-1 text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          <Trans>Reset all to default</Trans>
        </Button>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Reset all prompts to default?</Trans>
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={resetAll}
            >
              <Trans>Reset</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PromptPage({ id }: { id: PromptId }) {
  const { t } = useLingui();
  // Beside the list, the editor names its prompt; on its own page, the header does.
  const windowed = useSettingsWindow();
  const prompt = usePrompt(id);
  const text = prompt.custom
    ? (prompt.text ?? prompt.defaultText)
    : prompt.defaultText;
  const edited =
    prompt.custom &&
    prompt.text !== undefined &&
    prompt.text !== prompt.defaultText;
  const hasWarning = id === "gm" || id === "story-cards";
  const choice = (
    <Segmented<"default" | "custom">
      fill
      label={t`Prompt`}
      value={prompt.custom ? "custom" : "default"}
      options={[
        { value: "default", label: <Trans>Default</Trans> },
        { value: "custom", label: <Trans>Custom</Trans> },
      ]}
      onChange={(value) => {
        if (value === "custom" && prompt.text === undefined) {
          prompt.setText(prompt.defaultText);
        }
        prompt.setCustom(value === "custom");
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {windowed ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h4 className="text-base font-semibold">
              <PromptName id={id} />
            </h4>
            <p className="text-sm text-muted-foreground">
              <PromptUsage id={id} />
            </p>
          </div>
          {choice}
        </div>
      ) : (
        <p className="px-0.5 text-sm text-muted-foreground">
          <PromptUsage id={id} />
        </p>
      )}
      {hasWarning ? (
        <p className="px-0.5 text-sm text-destructive">
          <PromptWarning id={id} />
        </p>
      ) : null}
      {!windowed && choice}
      <Textarea
        value={text}
        readOnly={!prompt.custom}
        onChange={(event) => prompt.setText(event.target.value)}
        aria-label={t`Prompt`}
        className={cn(
          "min-h-[50dvh] font-mono text-[0.8rem] leading-relaxed",
          !prompt.custom && "text-muted-foreground",
        )}
      />
      <div className="flex min-h-8 items-center justify-between gap-3 px-0.5 text-sm text-muted-foreground">
        <span>{edited ? <Trans>Edited</Trans> : null}</span>
        {prompt.custom ? (
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={prompt.reset}
          >
            <Trans>Reset to default</Trans>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function promptFromPage(page: string | null) {
  return PROMPT_IDS.find((id) => page === pageOf(id));
}

/** Heads a prompt's page in the settings header. */
export function PromptingTitle({ page }: { page: string }) {
  const id = promptFromPage(page);
  return id ? <PromptName id={id} /> : <Trans>Prompting</Trans>;
}

export default function SettingsAdvanced() {
  const navigation = useSettingsNavigation();
  const windowed = useSettingsWindow();
  const [selected, setSelected] = useState<PromptId>("instructions");

  // The desktop window shows the list and the editor together, side by side when there's room.
  if (windowed) {
    return (
      <div className="@container">
        <div className="grid gap-6 @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:items-start">
          <PromptList selection={{ selected, onSelect: setSelected }} />
          <PromptPage id={selected} />
        </div>
      </div>
    );
  }
  const id = promptFromPage(navigation.page);
  return id ? <PromptPage id={id} /> : <PromptList />;
}
