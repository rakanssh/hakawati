import type { ChatMessage, ProviderReplay } from "@/services/llm/schema";
import type { AssistantMessage } from "@/types/assistant.type";

export const HISTORY_MESSAGES = 40;
export const RECENT_TOOL_RESULTS = 3;
export const OMITTED_RESULT = "Result omitted. Call the tool again if needed.";

/** The stored chat as the model sees it: replies keep their tool calls, older tool results are shortened. */
export function toModelHistory(messages: AssistantMessage[]): ChatMessage[] {
  let recent = messages.slice(-HISTORY_MESSAGES);
  const firstUser = recent.findIndex((message) => message.role === "user");
  recent = firstUser === -1 ? [] : recent.slice(firstUser);
  const replies = recent.filter(
    (message) =>
      message.role === "assistant" && message.turn && !message.status,
  );
  const keepResults = new Set(replies.slice(-RECENT_TOOL_RESULTS));

  return recent.flatMap((message): ChatMessage[] => {
    if (message.role === "user")
      return [{ role: "user", content: message.content }];
    if (message.turn && !message.status) {
      const full = keepResults.has(message);
      return message.turn.map((item) => ({
        role: item.role,
        content: item.role === "tool" && !full ? OMITTED_RESULT : item.content,
        ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
        ...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
        ...(item.replay ? { replay: item.replay as ProviderReplay } : {}),
      }));
    }
    return message.content.trim()
      ? [{ role: "assistant", content: message.content }]
      : [];
  });
}
