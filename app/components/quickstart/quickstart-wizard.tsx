import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  GameModeStep,
  SettingStep,
  ArchetypeStep,
  CharacterNameStep,
  ToneStep,
  OptionalDetailsStep,
} from "./steps";
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
  setting: string;
  customSetting: string;
  archetype: string;
  customArchetype: string;
  characterName: string;
  tone: string;
  customTone: string;
  extraDetails: string;
}

interface QuickstartWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickstartWizard({
  open,
  onOpenChange,
}: QuickstartWizardProps) {
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
    setting: "fantasy",
    customSetting: "",
    archetype: "warrior",
    customArchetype: "",
    characterName: "",
    tone: "serious",
    customTone: "",
    extraDetails: "",
  });

  const updateState = (updates: Partial<QuickstartState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleNextRef = useRef<(() => void) | null>(null);

  const handleNext = useCallback(() => {
    if (handleNextRef.current) {
      handleNextRef.current();
    }
  }, []);

  const resetState = useCallback(() => {
    setCurrentStep(0);
    setIsGenerating(false);
    abortRef.current = null;
    setState({
      gameMode: GameMode.STORY_TELLER,
      setting: "fantasy",
      customSetting: "",
      archetype: "warrior",
      customArchetype: "",
      characterName: "",
      tone: "serious",
      customTone: "",
      extraDetails: "",
    });
  }, []);

  const selectedSetting = SETTINGS.find(
    (setting) => setting.id === state.setting,
  );
  const selectedWorld =
    state.setting === "custom"
      ? state.customSetting.trim()
      : selectedSetting
        ? _(selectedSetting.name)
        : state.setting;

  const selectedArchetypeOption = ARCHETYPES[state.setting]?.find(
    (archetype) => archetype.id === state.archetype,
  );
  const selectedArchetype =
    state.archetype === "custom-archetype"
      ? state.customArchetype.trim()
      : selectedArchetypeOption
        ? _(selectedArchetypeOption.name)
        : state.archetype;

  const selectedToneOption = TONES.find((tone) => tone.id === state.tone);
  const selectedTone =
    state.tone === "custom-tone"
      ? state.customTone.trim()
      : selectedToneOption
        ? _(selectedToneOption.name)
        : state.tone;

  const steps = [
    {
      title: t`Game Mode`,
      description: t`Choose your play style`,
      component: (
        <GameModeStep
          value={state.gameMode}
          onChange={(gameMode) => updateState({ gameMode })}
        />
      ),
      canProgress: true,
    },
    {
      title: t`Setting`,
      description: t`Pick your world`,
      component: (
        <SettingStep
          value={state.setting}
          customValue={state.customSetting}
          onChange={(setting: string) => {
            const archetypes = ARCHETYPES[setting];
            updateState({
              setting,
              archetype:
                setting === "custom"
                  ? "custom-archetype"
                  : archetypes?.[0]?.id || "custom-archetype",
              customArchetype:
                setting === "custom" ? state.customArchetype : "",
            });
          }}
          onCustomChange={(customSetting: string) =>
            updateState({ customSetting })
          }
          onNext={handleNext}
        />
      ),
      canProgress:
        state.setting !== "custom" || state.customSetting.trim().length > 0,
    },
    {
      title: t`Character Name`,
      description: t`Name your hero`,
      component: (
        <CharacterNameStep
          value={state.characterName}
          onChange={(characterName: string) => updateState({ characterName })}
        />
      ),
      canProgress: state.characterName.trim().length > 0,
    },
    {
      title: t`Archetype`,
      description: t`Define your character`,
      component: (
        <ArchetypeStep
          setting={state.setting}
          value={state.archetype}
          customValue={state.customArchetype}
          onChange={(archetype: string) => {
            updateState({ archetype });
          }}
          onCustomChange={(customArchetype: string) =>
            updateState({ customArchetype })
          }
          onNext={handleNext}
        />
      ),
      canProgress:
        state.archetype !== "custom-archetype" ||
        state.customArchetype.trim().length > 0,
    },
    {
      title: t`Tone`,
      description: t`Set the atmosphere`,
      component: (
        <ToneStep
          value={state.tone}
          customValue={state.customTone}
          onChange={(tone: string) => updateState({ tone })}
          onCustomChange={(customTone: string) => updateState({ customTone })}
          onNext={handleNext}
        />
      ),
      canProgress:
        state.tone !== "custom-tone" || state.customTone.trim().length > 0,
    },
    {
      title: t`Optional Details`,
      description: t`Add anything special`,
      component: (
        <OptionalDetailsStep
          value={state.extraDetails}
          onChange={(extraDetails: string) => updateState({ extraDetails })}
        />
      ),
      canProgress: true,
    },
  ];

  // Set up the actual handleNext implementation now that steps is defined
  useEffect(() => {
    handleNextRef.current = () => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    };
  }, [steps.length]);

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep]);

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
          world: selectedWorld,
          characterName: state.characterName.trim(),
          archetype: selectedArchetype,
          tone: selectedTone,
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

      onOpenChange(false);
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
  }, [
    utilityConfig,
    t,
    state.gameMode,
    state.characterName,
    state.extraDetails,
    selectedWorld,
    selectedArchetype,
    selectedTone,
    taleStore,
    setLastPlayedTaleId,
    onOpenChange,
    navigate,
  ]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLButtonElement ||
        isGenerating
      ) {
        return;
      }
      if (event.key === "Enter" && currentStepData.canProgress) {
        if (isLastStep) {
          handleComplete();
        } else {
          handleNext();
        }
      }
    },
    [
      currentStepData.canProgress,
      isLastStep,
      handleComplete,
      handleNext,
      isGenerating,
    ],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyPress);
      return () => document.removeEventListener("keydown", handleKeyPress);
    }
  }, [open, handleKeyPress]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      abortRef.current?.abort();
      resetState();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="!h-[96vh] !mt-4">
        <div className="flex flex-col h-full overflow-hidden">
          <DrawerHeader className="border-b shrink-0">
            <div className="flex items-center gap-2">
              <DrawerTitle>{currentStepData.title}</DrawerTitle>
            </div>
            <DrawerDescription>{currentStepData.description}</DrawerDescription>
            <div className="flex gap-1 mt-4">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    index <= currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </DrawerHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">{currentStepData.component}</div>
          </ScrollArea>

          <div className="border-t p-4 flex justify-between gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={isFirstStep || isGenerating}
            >
              <ChevronLeft className="w-4 h-4 mr-1 rtl:rotate-180" />
              <Trans>Back</Trans>
            </Button>
            <div className="text-sm text-muted-foreground self-center">
              <Trans>
                Step {currentStep + 1} of {steps.length}
              </Trans>
            </div>
            {isLastStep ? (
              <Button
                onClick={handleComplete}
                disabled={!currentStepData.canProgress || isGenerating}
                className="bg-primary"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    <Trans>Generating</Trans>
                  </>
                ) : (
                  <Trans>Generate Tale</Trans>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!currentStepData.canProgress || isGenerating}
              >
                <Trans>Next</Trans>
                <ChevronRight className="w-4 h-4 ml-1 rtl:rotate-180" />
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
