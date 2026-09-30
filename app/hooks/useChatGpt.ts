import { useEffect } from "react";
import { useChatGptStore } from "@/store/useChatGptStore";

export function useChatGpt(enabled = true) {
  const state = useChatGptStore();
  useEffect(() => {
    const current = useChatGptStore.getState();
    if (enabled && !current.session && !current.loading && !current.error) {
      void current.load();
    }
  }, [enabled]);
  return state;
}
