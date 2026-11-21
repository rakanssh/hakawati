import type { AssistantActivity } from "@/types/assistant.type";

const EDIT_TOOLS = new Set([
  "edit_tale",
  "edit_log",
  "edit_scenario",
  "scenario_from_tale",
]);

export type TimelineStep = { activity: AssistantActivity; running: boolean };
export type TimelinePart =
  | { kind: "text"; text: string }
  | { kind: "steps"; steps: TimelineStep[] };

export function replyTimeline(
  content: string,
  activity: AssistantActivity[],
  toolRunning: boolean,
): TimelinePart[] {
  const parts: TimelinePart[] = [];
  let from = 0;
  activity.forEach((item, index) => {
    const running = toolRunning && index === activity.length - 1;
    if (!running && !item.error && (item.changed || EDIT_TOOLS.has(item.tool)))
      return;
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

export function foldTimeline(parts: TimelinePart[]): {
  folded: TimelinePart[];
  shown: TimelinePart[];
} {
  const last = parts.at(-1);
  if (!last) return { folded: [], shown: [] };
  const folded = parts.slice(0, -1);
  let shown: TimelinePart[] = [last];
  if (last.kind === "steps" && last.steps.length > 1) {
    folded.push({ kind: "steps", steps: last.steps.slice(0, -1) });
    shown = [{ kind: "steps", steps: last.steps.slice(-1) }];
  }
  return folded.some((part) => part.kind === "steps")
    ? { folded, shown }
    : { folded: [], shown: parts };
}

export const stepCount = (parts: TimelinePart[]) =>
  parts.reduce(
    (count, part) => count + (part.kind === "steps" ? part.steps.length : 0),
    0,
  );
