import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DicesIcon,
  HandIcon,
  SendIcon,
  SpeechIcon,
  BookIcon,
  MegaphoneIcon,
  SaveIcon,
  SquareIcon,
  TriangleIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import {
  RedoControl,
  RetryControl,
  UndoControl,
  useLogControlShortcuts,
} from "@/components/play/log";
import { getPlaceholderMessage, Action } from "@/lib/play-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { appendTranscriptToInput } from "@/lib/speech-recording";
import {
  SpeechActivity,
  SpeechButton,
  useSpeechInput,
} from "@/components/speech/speech-input";
import { Trans, useLingui } from "@lingui/react/macro";
import { type Dispatch, type SetStateAction } from "react";

interface PlayInputControlsProps {
  action: Action;
  setAction: (action: Action) => void;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  onSubmit: () => void;
  onStop?: () => void;
  loading: boolean;
  saving: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ACTION_MODES = [
  LogEntryMode.DO,
  LogEntryMode.SAY,
  LogEntryMode.STORY,
  LogEntryMode.DIRECT,
] as const;

type InputActionMode = (typeof ACTION_MODES)[number];

/** Switching mode or rolling leaves focus in the input, so a phone's keyboard stays open. */
function keepTypingFocus(event: React.MouseEvent) {
  event.preventDefault();
}

const ACTION_MODE_ICONS = {
  [LogEntryMode.DO]: HandIcon,
  [LogEntryMode.SAY]: SpeechIcon,
  [LogEntryMode.STORY]: BookIcon,
  [LogEntryMode.DIRECT]: MegaphoneIcon,
} satisfies Record<InputActionMode, typeof HandIcon>;

// The open tab wears the colour the log gives that kind of turn.
const ACTION_MODE_TAB_COLORS = {
  [LogEntryMode.DO]: "text-log-do",
  [LogEntryMode.SAY]: "text-log-say",
  [LogEntryMode.STORY]: "text-primary",
  [LogEntryMode.DIRECT]: "text-log-direct",
} satisfies Record<InputActionMode, string>;

function isInputActionMode(mode: LogEntryMode): mode is InputActionMode {
  return ACTION_MODES.includes(mode as InputActionMode);
}

export function PlayInputControls({
  action,
  setAction,
  input,
  setInput,
  onSubmit,
  onStop,
  loading,
  saving,
  onContinue,
  onRetry,
  onUndo,
  onRedo,
}: PlayInputControlsProps) {
  const { t } = useLingui();
  const { isMobilePlatform } = useIsMobile();
  const speechRecorder = useSpeechInput((text) => {
    setInput((current) => appendTranscriptToInput(current, text));
  });

  const currentActionMode = isInputActionMode(action.type)
    ? action.type
    : LogEntryMode.DO;

  const actionModeTabLabels = {
    [LogEntryMode.DO]: t`Act`,
    [LogEntryMode.SAY]: t`Speak`,
    [LogEntryMode.STORY]: t`Story`,
    [LogEntryMode.DIRECT]: t`Direct`,
  } satisfies Record<InputActionMode, string>;

  const composerControlsLocked = speechRecorder.status !== "idle";
  const canStopGeneration = loading && !!onStop;
  const composerSurfaceClass = cn(
    "flex min-w-0 overflow-hidden rounded-xs rounded-ss-none border border-border/75 bg-[var(--composer-background)] shadow-lg shadow-background/25 transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18",
    // On phones the box is a single row, so the story keeps the screen.
    isMobilePlatform ? "p-1" : "min-h-[6.25rem] p-1.5 md:min-h-[6rem]",
  );
  useLogControlShortcuts({
    handleUndo: onUndo,
    handleRedo: onRedo,
    handleRetry: onRetry,
    handleStop: onStop,
    loading,
    saving,
  });

  // The open tab joins the input box; on phones the others shrink to icons.
  const renderModeTabs = () => (
    <div
      role="group"
      aria-label={t`Select action mode`}
      data-composer-mode=""
      className={cn(
        // Themes restyle the tab type here, so the tabs inherit its size.
        "flex min-w-0 items-end gap-1 text-sm",
        composerControlsLocked && "pointer-events-none opacity-60",
      )}
    >
      {ACTION_MODES.map((mode) => {
        const active = currentActionMode === mode;
        const Icon = ACTION_MODE_ICONS[mode];
        const label = actionModeTabLabels[mode];
        const iconOnly = isMobilePlatform && !active;

        return (
          <button
            key={mode}
            type="button"
            data-composer-tab=""
            data-active={active ? "" : undefined}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onMouseDown={keepTypingFocus}
            onClick={() =>
              setAction({
                type: mode,
                isRolling: action.isRolling,
              })
            }
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 rounded-t-xs border border-b-0 font-medium transition-colors",
              active
                ? cn(
                    "relative z-10 -mb-px border-border/75 bg-[var(--composer-background)] font-semibold",
                    ACTION_MODE_TAB_COLORS[mode],
                  )
                : "border-transparent bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              isMobilePlatform
                ? active
                  ? "h-10 px-3 landscape:h-8"
                  : "h-9 w-10 landscape:h-7"
                : active
                  ? "h-10 px-4"
                  : "h-9 px-3.5",
            )}
          >
            <Icon className="size-[1.125rem]" />
            {!iconOnly && (
              <span
                className={
                  active
                    ? "composer-tab-active-label"
                    : "composer-command-label"
                }
              >
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Rolling changes the kind of turn, like the mode, so it sits beside the tabs;
  // phones fit it into the input row instead.
  const renderRollToggle = () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-composer-roll=""
          aria-pressed={action.isRolling}
          aria-label={t`Roll a dice`}
          onMouseDown={keepTypingFocus}
          onClick={() =>
            setAction({
              type: action.type,
              isRolling: !action.isRolling,
            })
          }
          disabled={loading}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
            "rounded-xs",
            isMobilePlatform ? "size-10 landscape:size-9" : "mb-1 h-9 px-3.5",
            action.isRolling
              ? "border-primary/55 bg-primary/15 text-primary"
              : isMobilePlatform
                ? "border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                : "border-border/75 bg-[var(--composer-background)] text-muted-foreground hover:bg-muted hover:text-foreground",
            composerControlsLocked && "pointer-events-none opacity-60",
          )}
        >
          <DicesIcon className="size-[1.125rem]" strokeWidth={1.5} />
          {!isMobilePlatform && (
            <span className="composer-command-label">{t`Roll`}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Roll a dice</Trans>
      </TooltipContent>
    </Tooltip>
  );

  const renderSpeechButton = () => (
    <SpeechButton
      recorder={speechRecorder}
      disabled={loading || saving}
      className={cn(isMobilePlatform && "landscape:size-9")}
    />
  );

  const renderTextArea = () => (
    <Textarea
      data-composer-input=""
      placeholder={t(getPlaceholderMessage(action.type))}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (loading || saving) return;
          onSubmit();
        }
      }}
      rows={1}
      className={cn(
        "max-h-[240px] min-h-10 resize-none border-0 !bg-transparent px-2.5 py-2.5 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent",
        // A sideways phone is as wide as a desktop window, but keeps phone-sized text.
        isMobilePlatform
          ? "md:text-base landscape:min-h-9 landscape:py-1.5"
          : "md:py-2 md:text-lg",
      )}
      aria-label={t`Enter your action`}
    />
  );

  // With nothing typed, the send button continues the story instead.
  const continuesStory = !canStopGeneration && !input.trim();

  const renderSubmitButton = () => (
    <Button
      type={canStopGeneration ? "button" : "submit"}
      onClick={
        canStopGeneration ? onStop : continuesStory ? onContinue : onSubmit
      }
      disabled={saving || (loading && !canStopGeneration)}
      size="icon"
      data-composer-send=""
      className={cn(
        "shrink-0 rounded-xs",
        isMobilePlatform ? "size-11 landscape:size-9" : "size-12",
      )}
      aria-label={
        canStopGeneration
          ? t`Stop generating`
          : continuesStory
            ? t`Continue`
            : t`Submit action`
      }
    >
      {canStopGeneration ? (
        <SquareIcon className="size-4 fill-current" />
      ) : saving ? (
        <SaveIcon className="size-5 animate-spin" />
      ) : continuesStory ? (
        // A visual novel's "advance" marker.
        <TriangleIcon className="size-4 rotate-180 fill-current" />
      ) : (
        <SendIcon className="size-5" />
      )}
    </Button>
  );

  const renderHistoryControls = () => {
    // Desktop has room to name each action; phones show icons beside the tabs.
    const buttonClass = isMobilePlatform
      ? "size-10 landscape:size-8"
      : "h-10 px-3";
    return (
      <div
        className={cn(
          "flex min-w-0 shrink-0 items-center",
          !isMobilePlatform && "gap-0.5",
          composerControlsLocked && "pointer-events-none opacity-60",
        )}
      >
        <UndoControl
          handleUndo={onUndo}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
        <RetryControl
          handleRetry={onRetry}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
        <RedoControl
          handleRedo={onRedo}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
      </div>
    );
  };

  const renderSubmitControls = () => (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2",
        composerControlsLocked && "pointer-events-none opacity-60",
      )}
    >
      {renderSpeechButton()}
      {renderSubmitButton()}
    </div>
  );

  const renderInputSurface = () => (
    <div data-composer-surface="" className={composerSurfaceClass}>
      {speechRecorder.status !== "idle" ? (
        <SpeechActivity recorder={speechRecorder} />
      ) : isMobilePlatform ? (
        <div className="flex min-w-0 flex-1 items-end gap-1">
          <div className="min-w-0 flex-1">{renderTextArea()}</div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              composerControlsLocked && "pointer-events-none opacity-60",
            )}
          >
            {renderRollToggle()}
            {renderSpeechButton()}
            {renderSubmitButton()}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-w-0">{renderTextArea()}</div>
          <div className="composer-command-controls flex min-w-0 items-center justify-between gap-2">
            {renderHistoryControls()}
            {renderSubmitControls()}
          </div>
        </div>
      )}
    </div>
  );

  const renderComposer = () => (
    <div
      data-composer-frame=""
      className="composer-command-tier mx-auto w-full max-w-(--play-composer-max)"
    >
      {/* When the tabs and the controls beside them don't fit on one line (large
          UI scale, narrow phone), the controls move to a line above, so the tabs
          stay on the box. */}
      <div
        data-composer-tabs=""
        className="flex min-w-0 flex-wrap-reverse items-start justify-between gap-x-2 gap-y-1"
      >
        {renderModeTabs()}
        <div className="ms-auto flex">
          {isMobilePlatform ? renderHistoryControls() : renderRollToggle()}
        </div>
      </div>
      {renderInputSurface()}
    </div>
  );

  // A phone held sideways has little height to spare, so its controls slim
  // down (the landscape: sizes) to leave the story more room.
  return (
    <div
      data-composer=""
      className={cn(
        "pointer-events-auto z-20 w-full",
        isMobilePlatform ? "px-2 pt-2 landscape:pt-1" : "p-3",
      )}
      style={
        isMobilePlatform
          ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      {renderComposer()}
    </div>
  );
}
