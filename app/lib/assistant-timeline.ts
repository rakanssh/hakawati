import type { AssistantActivity } from "@/types/assistant.type";

const EDIT_TOOLS = new Set([
  "update_tale",
  "edit_story_cards",
  "edit_character",
  "edit_log",
  "edit_scenario",
  "scenario_from_tale",
]);

export type TimelineStep = { activity: AssistantActivity; running: boolean };
export type TimelinePart =
  | { kind: "text"; text: string }
  | { kind: "steps"; steps: TimelineStep[] };

/** A reply's text and tool steps in the order they happened. Edits that worked show as changes instead. */
export function replyTimeline(
  content: string,
  activity: AssistantActivity[],
  toolRunning: boolean,
): TimelinePart[] {
  const parts: TimelinePart[] = [];
  let from = 0;
  activity.forEach((item, index) => {
    const running = toolRunning && index === activity.length - 1;
    if (!running && !item.error && EDIT_TOOLS.has(item.tool)) return;
    const at = Math.min(content.length, Math.max(from, item.at ?? 0));
    const text = content.slice(from, at).trim();
    if (text) parts.push({ kind: "text", text });
    from = at;
    const last = parts.at(-1);
    if (last?.kind === "steps") last.steps.push({ activity: item, running });
    else parts.push({ kind: "steps", steps: [{ activity: item, running }] });
  });
  const rest = content.slice(from).trim();
  if (rest) parts.push({ kind: "text", text: rest });
  return parts;
}
