import { DEFAULT_TTS_VOICE, useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { GameMode, type LLMModel, type ModelRole } from "@/types";

export type ModelChoiceWarning = "narrator_tools" | "hakawati_tools";

export function modelChoiceWarnings(
  role: ModelRole,
  model: LLMModel,
): ModelChoiceWarning[] {
  if (model.supportsToolCalls) return [];
  if (role === "hakawati") return ["hakawati_tools"];
  return role === "narrator" && useTaleStore.getState().gameMode === GameMode.GM
    ? ["narrator_tools"]
    : [];
}

export function chooseRoleModel(
  role: ModelRole,
  model: LLMModel,
): ModelChoiceWarning[] {
  const warnings = modelChoiceWarnings(role, model);
  const settings = useSettingsStore.getState();
  settings.setRoleModel(role, model);
  if (role === "textToSpeech" && model.supportedVoices?.length) {
    const voice = useSettingsStore
      .getState()
      .modelRoles.textToSpeech.voice?.trim();
    if (
      !voice ||
      voice === DEFAULT_TTS_VOICE ||
      !model.supportedVoices.includes(voice)
    )
      settings.setRoleVoice(role, model.supportedVoices[0]);
  }
  return warnings;
}
