import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { GameModeStep } from "./steps";
import { GameMode } from "@/types";
import { ARCHETYPES, SETTINGS, TONES } from "@/data/quickstart-presets";
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
  icon?: string;
};

type StepData = {
  title: string;
  question: string;
  hint: string;
  component: React.ReactNode;
  canProgress: boolean;
};

function optionPanelClass(isSelected: boolean) {
  return cn(
    "group flex min-h-12 items-center gap-3 rounded-xs border bg-card/55 px-3 py-2.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:bg-card/80 hover:shadow-md focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
    isSelected &&
      "border-primary bg-primary/10 text-foreground ring-2 ring-primary/35",
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
      <Input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-xs border-border/75 bg-background/70 px-4 text-center text-lg shadow-lg shadow-background/20 backdrop-blur-sm md:text-xl"
        autoFocus
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
                <Shuffle className="h-3.5 w-3.5" />
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
                  {suggestion.icon && (
                    <span className="text-xl leading-none">
                      {suggestion.icon}
                    </span>
                  )}
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
      <Input
        id="character-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t`Enter your character's name...`}
        className="h-14 rounded-xs border-border/75 bg-background/70 px-4 text-center text-lg shadow-lg shadow-background/20 backdrop-blur-sm md:text-xl"
        autoFocus
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

  const defaultWorld = useMemo(() => {
    const world = SETTINGS.find((setting) => setting.id === "fantasy");
    return world ? _(world.name) : "Fantasy";
  }, [_]);
  const defaultArchetype = useMemo(() => {
    const archetype = ARCHETYPES.fantasy?.find((item) => item.id === "warrior");
    return archetype ? _(archetype.name) : "Warrior";
  }, [_]);
  const defaultTone = useMemo(() => {
    const tone = TONES.find((item) => item.id === "serious");
    return tone ? _(tone.name) : "Serious";
  }, [_]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<QuickstartState>({
    gameMode: GameMode.STORY_TELLER,
    selectedWorldId: "fantasy",
    world: defaultWorld,
    selectedArchetypeId: "warrior",
    archetype: defaultArchetype,
    characterName: "",
    selectedToneId: "serious",
    tone: defaultTone,
    extraDetails: "",
  });

  const updateState = (updates: Partial<QuickstartState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const worldSuggestions = useMemo<Suggestion[]>(
    () =>
      SETTINGS.filter((setting) => setting.id !== "custom").map((setting) => ({
        id: setting.id,
        label: _(setting.name),
        icon: setting.icon,
      })),
    [_],
  );

  const archetypeSuggestions = useMemo<Suggestion[]>(() => {
    if (!state.selectedWorldId) return [];
    return (ARCHETYPES[state.selectedWorldId] || [])
      .filter((archetype) => archetype.id !== "custom-archetype")
      .map((archetype) => ({
        id: archetype.id,
        label: _(archetype.name),
      }));
  }, [_, state.selectedWorldId]);

  const toneSuggestions = useMemo<Suggestion[]>(
    () =>
      TONES.filter((tone) => tone.id !== "custom-tone").map((tone) => ({
        id: tone.id,
        label: _(tone.name),
      })),
    [_],
  );

  const selectWorld = useCallback(
    (suggestion: Suggestion) => {
      const nextArchetypes = ARCHETYPES[suggestion.id] || [];
      const nextArchetype = nextArchetypes.find(
        (archetype) => archetype.id !== "custom-archetype",
      );
      updateState({
        selectedWorldId: suggestion.id,
        world: suggestion.label,
        selectedArchetypeId: nextArchetype?.id ?? null,
        archetype: nextArchetype ? _(nextArchetype.name) : "",
      });
    },
    [_],
  );

  const handleWorldInput = (world: string) => {
    updateState({
      world,
      selectedWorldId: null,
      selectedArchetypeId: null,
      archetype: "",
    });
  };

  const selectRandom = (
    suggestions: Suggestion[],
    select: (item: Suggestion) => void,
  ) => {
    if (suggestions.length === 0) return;
    select(suggestions[Math.floor(Math.random() * suggestions.length)]);
  };

  const steps: StepData[] = [
    {
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
    {
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
          onSuggestionSelect={selectWorld}
          onSurprise={() => selectRandom(worldSuggestions, selectWorld)}
        />
      ),
      canProgress: state.world.trim().length > 0,
    },
    {
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
    {
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
          onValueChange={(archetype) =>
            updateState({ archetype, selectedArchetypeId: null })
          }
          onSuggestionSelect={(suggestion) =>
            updateState({
              archetype: suggestion.label,
              selectedArchetypeId: suggestion.id,
            })
          }
          onSurprise={
            archetypeSuggestions.length > 0
              ? () =>
                  selectRandom(archetypeSuggestions, (suggestion) =>
                    updateState({
                      archetype: suggestion.label,
                      selectedArchetypeId: suggestion.id,
                    }),
                  )
              : undefined
          }
        />
      ),
      canProgress: state.archetype.trim().length > 0,
    },
    {
      title: t`Tone`,
      question: t`What should the tale feel like?`,
      hint: t`Type a tone, or choose one of the quick tone presets.`,
      component: (
        <SuggestedInput
          id="quickstart-tone"
          value={state.tone}
          placeholder={t`Describe the narrative tone...`}
          suggestions={toneSuggestions}
          selectedId={state.selectedToneId}
          optionColumns="sm:grid-cols-2"
          onValueChange={(tone) => updateState({ tone, selectedToneId: null })}
          onSuggestionSelect={(suggestion) =>
            updateState({
              tone: suggestion.label,
              selectedToneId: suggestion.id,
            })
          }
          onSurprise={() =>
            selectRandom(toneSuggestions, (suggestion) =>
              updateState({
                tone: suggestion.label,
                selectedToneId: suggestion.id,
              }),
            )
          }
        />
      ),
      canProgress: state.tone.trim().length > 0,
    },
    {
      title: t`Details`,
      question: t`Anything else before the tale begins?`,
      hint: t`Optional details can guide the opening, relationships, themes, or boundaries.`,
      component: (
        <OptionalDetailsQuestion
          value={state.extraDetails}
          onChange={(extraDetails) => updateState({ extraDetails })}
        />
      ),
      canProgress: true,
    },
  ];

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep]);

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

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
              <Home className="h-4 w-4" />
              <Trans>Home</Trans>
            </Button>
            <div className="hidden min-w-0 flex-1 items-center gap-1 sm:flex">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className={cn(
                    "h-1.5 flex-1 rounded-xs transition-all duration-300",
                    index <= currentStep ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <div className="rounded-xs border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
              <Trans>
                Step {currentStep + 1} of {steps.length}
              </Trans>
            </div>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div
            key={currentStep}
            className="flex w-full flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
              <div className="inline-flex items-center gap-2 rounded-xs border border-border/60 bg-background/55 px-3 py-1 text-xs font-medium uppercase text-muted-foreground shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
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
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              <Trans>Back</Trans>
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:hidden">
              {steps.map((step, index) => (
                <div
                  key={step.title}
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <Trans>Generating</Trans>
                </>
              ) : isLastStep ? (
                <Trans>Generate Tale</Trans>
              ) : (
                <>
                  <Trans>Next</Trans>
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </main>
  );
}

export const QuickstartWizard = QuickstartPage;
