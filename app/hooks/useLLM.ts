import { sendChat } from "@/services/llm";
import { ChatRequest } from "@/services/llm/schema";
import { useRef, useState } from "react";

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (req: ChatRequest) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    try {
      const res = await sendChat(req, abortRef.current?.signal);

      if (res.iterator) {
        let content = "";
        for await (const token of res.iterator) {
          content += token;
          // stream token to UI if desired
        }
        return content;
      }
      return res.content;
    } finally {
      setLoading(false);
    }
  };

  return { send, loading, cancel: () => abortRef.current?.abort() };
}
