import type { ChatMessage, ProviderReplay } from "@/services/llm/schema";
import type { AssistantMessage } from "@/types/assistant.type";

export const HISTORY_MESSAGES = 40;
export const RECENT_TOOL_RESULTS = 3;
export const OMITTED_RESULT = "Result omitted. Call the tool again if needed.";
export const UNDONE_NOTE = "(The player undid the changes from this reply.)";
export const PARTLY_UNDONE_NOTE =
  "(The player undid some of the changes from this reply.)";

const replaysTurn = (message: AssistantMessage) =>
  Boolean(message.turn) && (!message.status || message.status === "paused");

function undoNote(message: AssistantMessage): string | null {
  const undone = message.changes?.filter((change) => change.undone).length ?? 0;
  if (!undone) return null;
  return undone === message.changes!.length ? UNDONE_NOTE : PARTLY_UNDONE_NOTE;
}

export function toModelHistory(messages: AssistantMessage[]): ChatMessage[] {
  let recent = messages.slice(-HISTORY_MESSAGES);
  const firstUser = recent.findIndex((message) => message.role === "user");
  recent = firstUser === -1 ? [] : recent.slice(firstUser);
  const replies = recent.filter(
    (message) => message.role === "assistant" && replaysTurn(message),
  );
  const keepResults = new Set(replies.slice(-RECENT_TOOL_RESULTS));

  return recent.flatMap((message): ChatMessage[] => {
    if (message.role === "user")
      return [{ role: "user", content: message.content }];
    const note = undoNote(message);
    if (message.turn && replaysTurn(message)) {
      const full = keepResults.has(message);
      const items = message.turn.map(
        (item): ChatMessage => ({
          role: item.role,
          content:
            item.role === "tool" && !full ? OMITTED_RESULT : item.content,
          ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
          ...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
          ...(item.replay ? { replay: item.replay as ProviderReplay } : {}),
        }),
      );
      if (note) {
        const last = items.at(-1);
        if (last?.role === "assistant" && !last.tool_calls)
          items[items.length - 1] = {
            ...last,
            content: [last.content.trim(), note].filter(Boolean).join("\n\n"),
          };
        else items.push({ role: "assistant", content: note });
      }
      return items;
    }
    const content = [message.content.trim(), note].filter(Boolean).join("\n\n");
    return content ? [{ role: "assistant", content }] : [];
  });
}
