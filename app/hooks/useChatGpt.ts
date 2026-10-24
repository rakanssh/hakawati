import { useEffect } from "react";
import {
  cancelChatGptConnect,
  connectChatGpt,
  disconnectChatGpt,
  dismissChatGptPlanNotice,
  loadChatGptSession,
} from "@/services/chatgpt-connection";
import { useChatGptStore } from "@/store/useChatGptStore";

export function useChatGpt(enabled = true) {
  const state = useChatGptStore();
  useEffect(() => {
    const current = useChatGptStore.getState();
    if (enabled && !current.session && !current.loading && !current.error) {
      void loadChatGptSession();
    }
  }, [enabled]);
  return {
    ...state,
    load: loadChatGptSession,
    signIn: connectChatGpt,
    cancelSignIn: cancelChatGptConnect,
    signOut: disconnectChatGpt,
    dismissPlanNotice: dismissChatGptPlanNotice,
  };
}
