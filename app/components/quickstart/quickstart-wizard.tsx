import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GameModeStep } from "./steps";
import { GameMode } from "@/types";
import {
  QUICKSTART_ARCHETYPE_OPTIONS,
  QUICKSTART_TONE_OPTIONS,
  QUICKSTART_WORLD_OPTIONS,
} from "@/data/quickstart-presets";
import { useTaleStore } from "@/store/useTaleStore";
import { initTale } from "@/services/tale.service";
import { LogEntryRole } from "@/types/log.type";
import { nanoid } from "nanoid";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import { toast } from "sonner";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import {
  generateQuickstartTale,
  QUICKSTART_AUTHOR_NOTE,
} from "@/services/llm/quickstartTaleGenerator";

export interface QuickstartState {
  gameMode: GameMode;
  selectedWorldId: string | null;
  world: string;
  selectedArchetypeId: string | null;
  archetype: string;
  characterName: string;
  selectedToneId: string | null;
  tone: string;
  extraDetails: string;
}

type Suggestion = {
  id: string;
  label: string;
};

type StepData = {
  id: QuickstartStepId;
  title: string;
  question: string;
  hint: string;
  component: React.ReactNode;
  canProgress: boolean;
};

const QUICKSTART_STEP_IDS = [
  "game-mode",
  "world",
  "archetype",
  "character-name",
  "tone",
  "details",
] as const;

type QuickstartStepId = (typeof QUICKSTART_STEP_IDS)[number];

function optionPanelClass(isSelected: boolean) {
  return cn(
    "group flex min-h-12 items-center gap-3 rounded-xs border bg-card/55 px-3 py-2.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:bg-card/80 hover:shadow-md focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
    isSelected &&
      "border-primary bg-primary/10 text-foreground ring-2 ring-primary/35",
  );
}

function ClearableInput({
  id,
  value,
  placeholder,
  onValueChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useLingui();

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-xs border-border/75 bg-background/70 px-14 text-center text-lg shadow-lg shadow-background/20 backdrop-blur-sm md:text-xl"
        autoFocus
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t`Clear input`}
          className="absolute end-1.5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-xs px-0 text-base font-semibold leading-none text-muted-foreground hover:text-foreground"
          onClick={() => onValueChange("")}
        >
          X
        </Button>
      )}
    </div>
  );
}

function SuggestedInput({
  id,
  value,
  placeholder,
  suggestions,
  selectedId,
  optionColumns = "sm:grid-cols-2 lg:grid-cols-3",
  onValueChange,
  onSuggestionSelect,
  onSurprise,
}: {
  id: string;
  value: string;
  placeholder: string;
  suggestions: Suggestion[];
  selectedId: string | null;
  optionColumns?: string;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (suggestion: Suggestion) => void;
  onSurprise?: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <ClearableInput
        id={id}
        value={value}
        placeholder={placeholder}
        onValueChange={onValueChange}
      />

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              <Trans>Or choose one of these options.</Trans>
            </span>
            {onSurprise && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={onSurprise}
              >
                <Trans>Surprise Me</Trans>
              </Button>
            )}
          </div>

          <div className={cn("grid gap-2.5", optionColumns)}>
            {suggestions.map((suggestion) => {
              const isSelected = selectedId === suggestion.id;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  className={optionPanelClass(isSelected)}
                  onClick={() => onSuggestionSelect(suggestion)}
                >
                  <span className="min-w-0 truncate font-medium">
                    {suggestion.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterNameQuestion({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ClearableInput
        id="character-name"
        value={value}
        placeholder={t`Enter your character's name...`}
        onValueChange={onChange}
      />
    </div>
  );
}

function OptionalDetailsQuestion({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Textarea
        id="quickstart-extra-details"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t`e.g., Start during a festival, include a lost sibling, avoid grim endings...`}
        className="min-h-[180px] resize-none rounded-xs border-border/75 bg-background/70 p-4 text-base shadow-lg shadow-background/20 backdrop-blur-sm md:text-lg"
      />
    </div>
  );
}

export function QuickstartPage() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const { _ } = useLinguiCore();
  const taleStore = useTaleStore();
  const { setLastPlayedTaleId } = useLastPlayedStore();
  const utilityConfig = useSettingsStore((s) => s.modelRoles.utility);

  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<QuickstartState>({
    gameMode: GameMode.STORY_TELLER,
    selectedWorldId: null,
    world: "",
    selectedArchetypeId: null,
    archetype: "",
    characterName: "",
    selectedToneId: null,
    tone: "",
    extraDetails: "",
  });

  const updateState = useCallback((updates: Partial<QuickstartState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const worldSuggestions = useMemo<Suggestion[]>(
    () =>
      QUICKSTART_WORLD_OPTIONS.map((world) => ({
        id: world.id,
        label: _(world.name),
      })),
    [_],
  );

  const archetypeSuggestions = useMemo<Suggestion[]>(() => {
    if (!state.selectedWorldId) return [];
    return (QUICKSTART_ARCHETYPE_OPTIONS[state.selectedWorldId] || []).map(
      (archetype) => ({
        id: archetype.id,
        label: _(archetype.name),
      }),
    );
  }, [_, state.selectedWorldId]);

  const toneSuggestions = useMemo<Suggestion[]>(
    () =>
      QUICKSTART_TONE_OPTIONS.map((tone) => ({
        id: tone.id,
        label: _(tone.name),
      })),
    [_],
  );

  const handleWorldSelect = useCallback(
    (suggestion: Suggestion) => {
      updateState({
        selectedWorldId: suggestion.id,
        world: suggestion.label,
        selectedArchetypeId: null,
        archetype: "",
      });
    },
    [updateState],
  );

  const handleWorldInput = useCallback(
    (world: string) => {
      updateState({
        world,
        selectedWorldId: null,
        selectedArchetypeId: null,
        archetype: "",
      });
    },
    [updateState],
  );

  const handleArchetypeInput = useCallback(
    (archetype: string) => {
      updateState({ archetype, selectedArchetypeId: null });
    },
    [updateState],
  );

  const handleArchetypeSelect = useCallback(
    (suggestion: Suggestion) => {
      updateState({
        archetype: suggestion.label,
        selectedArchetypeId: suggestion.id,
      });
    },
    [updateState],
  );

  const handleToneInput = useCallback(
    (tone: string) => {
      updateState({ tone, selectedToneId: null });
    },
    [updateState],
  );

  const handleToneSelect = useCallback(
    (suggestion: Suggestion) => {
      updateState({
        tone: suggestion.label,
        selectedToneId: suggestion.id,
      });
    },
    [updateState],
  );

  const advanceStep = useCallback(() => {
    setCurrentStep((prev) =>
      Math.min(prev + 1, QUICKSTART_STEP_IDS.length - 1),
    );
  }, []);

  const selectRandomAndContinue = useCallback(
    (suggestions: Suggestion[], select: (item: Suggestion) => void) => {
      if (suggestions.length === 0) return;
      select(suggestions[Math.floor(Math.random() * suggestions.length)]);
      advanceStep();
    },
    [advanceStep],
  );

  const stepsById = {
    "game-mode": {
      title: t`Game Mode`,
      question: t`How do you want to play?`,
      hint: t`Choose the mode that fits the kind of tale you want to generate.`,
      component: (
        <div className="mx-auto w-full max-w-3xl">
          <GameModeStep
            value={state.gameMode}
            onChange={(gameMode) => updateState({ gameMode })}
          />
        </div>
      ),
      canProgress: true,
    },
    world: {
      title: t`World`,
      question: t`What world should the tale begin in?`,
      hint: t`Type your own world, or start from one of the suggestions below.`,
      component: (
        <SuggestedInput
          id="quickstart-world"
          value={state.world}
          placeholder={t`Describe the world...`}
          suggestions={worldSuggestions}
          selectedId={state.selectedWorldId}
          onValueChange={handleWorldInput}
          onSuggestionSelect={handleWorldSelect}
          onSurprise={() =>
            selectRandomAndContinue(worldSuggestions, handleWorldSelect)
          }
        />
      ),
      canProgress: state.world.trim().length > 0,
    },
    archetype: {
      title: t`Character`,
      question: t`Who are you in this world?`,
      hint: t`Type a role or pick an archetype suggested by the selected world.`,
      component: (
        <SuggestedInput
          id="quickstart-archetype"
          value={state.archetype}
          placeholder={t`Describe your character archetype...`}
          suggestions={archetypeSuggestions}
          selectedId={state.selectedArchetypeId}
          optionColumns="sm:grid-cols-2 lg:grid-cols-3"
          onValueChange={handleArchetypeInput}
          onSuggestionSelect={handleArchetypeSelect}
          onSurprise={
            archetypeSuggestions.length > 0
              ? () =>
                  selectRandomAndContinue(
                    archetypeSuggestions,
                    handleArchetypeSelect,
                  )
              : undefined
          }
        />
      ),
      canProgress: state.archetype.trim().length > 0,
    },
    "character-name": {
      title: t`Character Name`,
      question: t`What is your character's name?`,
      hint: t`This is the player character the tale will address directly.`,
      component: (
        <CharacterNameQuestion
          value={state.characterName}
          onChange={(characterName) => updateState({ characterName })}
        />
      ),
      canProgress: state.characterName.trim().length > 0,
    },
    tone: {
      title: t`Tone (Optional)`,
      question: t`What should the tale feel like?`,
      hint: t`Optional. Leave this blank if you do not want to specify a tone.`,
      component: (
        <SuggestedInput
          id="quickstart-tone"
          value={state.tone}
          placeholder={t`Optional tone preference...`}
          suggestions={toneSuggestions}
          selectedId={state.selectedToneId}
          optionColumns="sm:grid-cols-2"
          onValueChange={handleToneInput}
          onSuggestionSelect={handleToneSelect}
          onSurprise={() =>
            selectRandomAndContinue(toneSuggestions, handleToneSelect)
          }
        />
      ),
      canProgress: true,
    },
    details: {
      title: t`Details (Optional)`,
      question: t`Anything else before the tale begins?`,
      hint: t`Optional. Leave this blank to let the tale fill in the gaps.`,
      component: (
        <OptionalDetailsQuestion
          value={state.extraDetails}
          onChange={(extraDetails) => updateState({ extraDetails })}
        />
      ),
      canProgress: true,
    },
  } satisfies Record<QuickstartStepId, Omit<StepData, "id">>;

  const steps = QUICKSTART_STEP_IDS.map((id) => ({
    id,
    ...stepsById[id],
  }));

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === QUICKSTART_STEP_IDS.length - 1;

  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep]);

  const handleNext = useCallback(() => {
    advanceStep();
  }, [advanceStep]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    navigate({ to: "/" });
  }, [navigate]);

  const handleComplete = useCallback(async () => {
    if (!isModelRoleConfigured(utilityConfig)) {
      toast.error(t`No utility model selected`);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setIsGenerating(true);

    try {
      const generated = await generateQuickstartTale(
        {
          gameMode: state.gameMode,
          world: state.world.trim(),
          characterName: state.characterName.trim(),
          archetype: state.archetype.trim(),
          tone: state.tone.trim(),
          extraDetails: state.extraDetails,
        },
        abort.signal,
      );

      const taleId = await initTale({
        name: generated.name,
        description: generated.description,
        thumbnail: null,
        authorNote: QUICKSTART_AUTHOR_NOTE,
        storyCards: generated.storyCards,
        scenarioId: undefined,
        stats: generated.stats,
        inventory: generated.inventory,
        log: generated.openingText
          ? [
              {
                id: nanoid(12),
                role: LogEntryRole.GM,
                text: generated.openingText,
              },
            ]
          : [],
        gameMode: state.gameMode,
        undoStack: [],
      });

      taleStore.resetAllState();
      setLastPlayedTaleId(taleId);
      navigate({ to: "/play" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to generate quickstart tale:", error);
      toast.error(
        t`Failed to generate tale: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [utilityConfig, t, state, taleStore, setLastPlayedTaleId, navigate]);

  const handlePrimaryAction = useCallback(() => {
    if (!currentStepData.canProgress || isGenerating) return;
    if (isLastStep) {
      void handleComplete();
    } else {
      handleNext();
    }
  }, [
    currentStepData.canProgress,
    handleComplete,
    handleNext,
    isGenerating,
    isLastStep,
  ]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLButtonElement ||
        isGenerating
      ) {
        return;
      }
      if (event.key === "Enter") {
        handlePrimaryAction();
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [handlePrimaryAction, isGenerating]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <main className="relative flex min-h-full flex-col overflow-hidden">
      <div className="mx-auto flex min-h-full w-full max-w-screen-xl flex-1 flex-col px-3 py-4 sm:px-5 lg:px-8">
        <header className="animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between gap-3 rounded-xs border border-border/70 bg-card/60 p-2.5 shadow-lg shadow-background/20 backdrop-blur">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-xs"
              onClick={handleCancel}
              disabled={isGenerating}
            >
              <Trans>Home</Trans>
            </Button>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div
            key={currentStep}
            className="flex w-full flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
              <div className="inline-flex items-center rounded-xs border border-border/60 bg-background/55 px-3 py-1 text-xs font-medium uppercase text-muted-foreground shadow-sm backdrop-blur">
                {currentStepData.title}
              </div>
              <h1 className="text-balance text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                {currentStepData.question}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                {currentStepData.hint}
              </p>
            </div>

            <div className="w-full">{currentStepData.component}</div>
          </div>
        </section>

        <footer className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between gap-3 rounded-xs border border-border/70 bg-card/60 p-2.5 shadow-lg shadow-background/20 backdrop-blur">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={isFirstStep || isGenerating}
              className="rounded-xs"
            >
              <Trans>Back</Trans>
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-xs transition-all duration-300",
                    index <= currentStep ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <Button
              onClick={handlePrimaryAction}
              disabled={!currentStepData.canProgress || isGenerating}
              className="min-w-32 rounded-xs"
            >
              {isGenerating ? (
                <Trans>Generating</Trans>
              ) : isLastStep ? (
                <Trans>Generate Tale</Trans>
              ) : (
                <>
                  <Trans>Next</Trans>
                </>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </main>
  );
}
