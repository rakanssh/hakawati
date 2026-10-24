import { useCallback } from "react";
import { toast } from "sonner";
import { useLingui } from "@lingui/react/macro";
import { DEFAULT_TTS_VOICE, useSettingsStore } from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { GameMode, type LLMModel, type ModelRole } from "@/types";

/** Sets a role's model the same way wherever it is chosen. */
export function useChooseModel(role: ModelRole) {
  const { t } = useLingui();
  const gameMode = useTaleStore((state) => state.gameMode);
  const setRoleModel = useSettingsStore((state) => state.setRoleModel);
  const setRoleVoice = useSettingsStore((state) => state.setRoleVoice);

  return useCallback(
    (model: LLMModel) => {
      if (
        role === "narrator" &&
        !model.supportsToolCalls &&
        gameMode === GameMode.GM
      ) {
        toast.warning(
          t`Model cannot be confirmed to support tool calling. GM mode may not work properly.`,
        );
      }
      setRoleModel(role, model);
      // Keep a voice the new model offers.
      if (role === "textToSpeech" && model.supportedVoices?.length) {
        const voice = useSettingsStore
          .getState()
          .modelRoles.textToSpeech.voice?.trim();
        if (
          !voice ||
          voice === DEFAULT_TTS_VOICE ||
          !model.supportedVoices.includes(voice)
        ) {
          setRoleVoice(role, model.supportedVoices[0]);
        }
      }
    },
    [gameMode, role, setRoleModel, setRoleVoice, t],
  );
}
