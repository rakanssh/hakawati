import { useSettingsStore } from "@/store/useSettingsStore";
import {
  GM_SYSTEM_PROMPT,
  STORY_TELLER_SYSTEM_PROMPT,
  CONTINUE_SYSTEM_PROMPT,
  CONTINUE_AUTHOR_NOTE,
  STORY_CARD_GENERATOR_PROMPT,
  SCENARIO_GENERATOR_PROMPT,
  QUICKSTART_TALE_GENERATOR_PROMPT,
} from "./system";

export function getActiveGmPrompt(): string {
  const { useCustomGmPrompt, customGmPrompt } = useSettingsStore.getState();
  return useCustomGmPrompt && customGmPrompt
    ? customGmPrompt
    : GM_SYSTEM_PROMPT;
}

export function getActiveStorytellerPrompt(): string {
  const { useCustomStorytellerPrompt, customStorytellerPrompt } =
    useSettingsStore.getState();
  return useCustomStorytellerPrompt && customStorytellerPrompt
    ? customStorytellerPrompt
    : STORY_TELLER_SYSTEM_PROMPT;
}

export function getActiveContinuePrompt(): string {
  const { useCustomContinuePrompt, customContinuePrompt } =
    useSettingsStore.getState();
  return useCustomContinuePrompt && customContinuePrompt
    ? customContinuePrompt
    : CONTINUE_SYSTEM_PROMPT;
}

export function getActiveContinueAuthorNote(): string {
  const { useCustomContinueAuthorNote, customContinueAuthorNote } =
    useSettingsStore.getState();
  return useCustomContinueAuthorNote && customContinueAuthorNote
    ? customContinueAuthorNote
    : CONTINUE_AUTHOR_NOTE;
}

export function getActiveStoryCardGeneratorPrompt(): string {
  const { useCustomStoryCardGeneratorPrompt, customStoryCardGeneratorPrompt } =
    useSettingsStore.getState();
  return useCustomStoryCardGeneratorPrompt && customStoryCardGeneratorPrompt
    ? customStoryCardGeneratorPrompt
    : STORY_CARD_GENERATOR_PROMPT;
}

export function getActiveScenarioGeneratorPrompt(): string {
  return SCENARIO_GENERATOR_PROMPT;
}

export function getActiveQuickstartTaleGeneratorPrompt(): string {
  return QUICKSTART_TALE_GENERATOR_PROMPT;
}
