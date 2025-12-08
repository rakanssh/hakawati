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
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  GameModeStep,
  SettingStep,
  ArchetypeStep,
  CharacterNameStep,
  ToneStep,
  DescriptionStyleStep,
  StatsInventoryStep,
} from "./steps";
import { GameMode } from "@/types";
import { Stat } from "@/types/stats.type";
import type { Item } from "@/types/item.type";
import {
  generateAuthorNote,
  generateDescription,
  generateTaleName,
  generateOpeningPrompt,
  ARCHETYPES,
} from "@/data/quickstart-presets";
import { useTaleStore } from "@/store/useTaleStore";
import { initTale } from "@/services/tale.service";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import { nanoid } from "nanoid";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";

export interface QuickstartState {
  gameMode: GameMode;
  setting: string;
  customSetting: string;
  archetype: string;
  customArchetype: string;
  characterName: string;
  tone: string;
  description: string;
  authorNote: string;
  stats: Stat[];
  inventory: Item[];
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
  const taleStore = useTaleStore();
  const { setLastPlayedTaleId } = useLastPlayedStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<QuickstartState>({
    gameMode: GameMode.STORY_TELLER,
    setting: "fantasy",
    customSetting: "",
    archetype: "warrior",
    customArchetype: "",
    characterName: "",
    tone: "serious",
    description: "",
    authorNote: "",
    stats: [],
    inventory: [],
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

  const steps = [
    {
      title: "Game Mode",
      description: "Choose your play style",
      component: (
        <GameModeStep
          value={state.gameMode}
          onChange={(gameMode) => updateState({ gameMode })}
        />
      ),
      canProgress: true,
    },
    {
      title: "Setting",
      description: "Pick your world",
      component: (
        <SettingStep
          value={state.setting}
          customValue={state.customSetting}
          onChange={(setting: string) => {
            updateState({ setting });
            const archetypes = ARCHETYPES[setting];
            if (archetypes && archetypes.length > 0) {
              updateState({ archetype: archetypes[0].id });
            }
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
      title: "Archetype",
      description: "Define your character",
      component: (
        <ArchetypeStep
          setting={state.setting}
          value={state.archetype}
          customValue={state.customArchetype}
          gameMode={state.gameMode}
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
      title: "Character Name",
      description: "Name your hero",
      component: (
        <CharacterNameStep
          value={state.characterName}
          onChange={(characterName: string) => updateState({ characterName })}
        />
      ),
      canProgress: state.characterName.trim().length > 0,
    },
    {
      title: "Tone",
      description: "Set the atmosphere",
      component: (
        <ToneStep
          value={state.tone}
          onChange={(tone: string) => updateState({ tone })}
          onNext={handleNext}
        />
      ),
      canProgress: true,
    },
    {
      title: "Description & Style",
      description: "Customize your scenario and narration style",
      component: (
        <DescriptionStyleStep
          description={
            state.description ||
            generateDescription(
              state.characterName,
              state.archetype === "custom-archetype"
                ? state.customArchetype
                : state.archetype,
              state.setting === "custom" ? state.customSetting : state.setting,
              state.tone,
            )
          }
          style={
            state.authorNote ||
            generateAuthorNote(
              state.setting === "custom" ? state.customSetting : state.setting,
              state.tone,
            )
          }
          onDescriptionChange={(description: string) =>
            updateState({ description })
          }
          onStyleChange={(authorNote: string) => updateState({ authorNote })}
        />
      ),
      canProgress: true,
    },
  ];

  if (state.gameMode === GameMode.GM) {
    steps.push({
      title: "Stats & Inventory",
      description: "Configure your character",
      component: (
        <StatsInventoryStep
          stats={state.stats}
          inventory={state.inventory}
          archetype={state.archetype}
          setting={state.setting}
          onStatsChange={(stats: Stat[]) => updateState({ stats })}
          onInventoryChange={(inventory: Item[]) => updateState({ inventory })}
        />
      ),
      canProgress: state.stats.length > 0,
    });
  }

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
    const finalAuthorNote =
      state.authorNote ||
      generateAuthorNote(
        state.setting === "custom" ? state.customSetting : state.setting,
        state.tone,
      );

    const taleName = generateTaleName(state.characterName, state.setting);
    const taleDescription =
      state.description ||
      generateDescription(
        state.characterName,
        state.archetype === "custom-archetype"
          ? state.customArchetype
          : state.archetype,
        state.setting === "custom" ? state.customSetting : state.setting,
        state.tone,
      );

    let finalStats = state.stats;
    let finalInventory = state.inventory;

    if (state.gameMode === GameMode.GM && finalStats.length === 0) {
      const archetypeData = ARCHETYPES[state.setting]?.find(
        (a) => a.id === state.archetype,
      );
      finalStats = archetypeData?.defaultStats || [
        { name: "HP", value: 100, range: [0, 100] },
      ];
      finalInventory = (archetypeData?.defaultInventory || []).map((item) => ({
        id: nanoid(12),
        name: item.name,
        description: item.description,
      }));
    }

    const openingPrompt = generateOpeningPrompt(
      state.characterName,
      state.archetype === "custom-archetype"
        ? state.customArchetype
        : state.archetype,
      state.setting === "custom" ? state.customSetting : state.setting,
    );

    const initialLogEntry = {
      id: nanoid(),
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.DIRECT,
      text: openingPrompt,
    };

    try {
      const taleId = await initTale({
        name: taleName,
        description: taleDescription,
        thumbnail: null,
        authorNote: finalAuthorNote,
        storyCards: [],
        scenarioId: undefined,
        stats: finalStats,
        inventory: finalInventory,
        log: [initialLogEntry],
        gameMode: state.gameMode,
        undoStack: [],
      });

      taleStore.resetAllState();
      setLastPlayedTaleId(taleId);

      onOpenChange(false);
      navigate({ to: "/play" });
    } catch (error) {
      console.error("Failed to save tale:", error);
    }
  }, [state, taleStore, onOpenChange, navigate, setLastPlayedTaleId]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && currentStepData.canProgress) {
        if (isLastStep) {
          handleComplete();
        } else {
          handleNext();
        }
      }
    },
    [currentStepData.canProgress, isLastStep, handleComplete, handleNext],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyPress);
      return () => document.removeEventListener("keydown", handleKeyPress);
    }
  }, [open, handleKeyPress]);

  const handleClose = () => {
    setCurrentStep(0);
    setState({
      gameMode: GameMode.GM,
      setting: "fantasy",
      customSetting: "",
      archetype: "warrior",
      customArchetype: "",
      characterName: "",
      tone: "serious",
      description: "",
      authorNote: "",
      stats: [],
      inventory: [],
    });
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
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
              disabled={isFirstStep}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="text-sm text-muted-foreground self-center">
              Step {currentStep + 1} of {steps.length}
            </div>
            {!isLastStep ? (
              <Button
                onClick={handleNext}
                disabled={!currentStepData.canProgress}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={!currentStepData.canProgress}
                className="bg-primary"
              >
                Start Adventure
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
