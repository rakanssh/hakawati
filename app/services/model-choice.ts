import { DEFAULT_TTS_VOICE, useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { GameMode, type LLMModel, type ModelRole } from "@/types";

export type ModelChoiceWarning = "narrator_tools" | "hakawati_tools";

/** Sets a role's model the same way wherever it is chosen, and says what might not work with it. */
export function chooseRoleModel(
  role: ModelRole,
  model: LLMModel,
): ModelChoiceWarning[] {
  const warnings: ModelChoiceWarning[] = [];
  if (
    role === "narrator" &&
    !model.supportsToolCalls &&
    useTaleStore.getState().gameMode === GameMode.GM
  )
    warnings.push("narrator_tools");
  if (role === "hakawati" && !model.supportsToolCalls)
    warnings.push("hakawati_tools");
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
