import { LogEntry, LogEntryRole } from "@/types/log.type";

// Older saves hold this as a failed reply's text.
export const FAILED_REPLY_PLACEHOLDER =
  "An error occurred while processing your request.";

export const MAX_RECAP_LINES = 6;
export const DEFAULT_RECAP_SHARE = 30;
export const MIN_RECAP_SHARE = 10;
export const MAX_RECAP_SHARE = 60;
export const MAX_RECAP_LINE_LENGTH = 240;

export function isFailedReplyPlaceholder(entry: LogEntry): boolean {
  return entry.error !== undefined && entry.text === FAILED_REPLY_PLACEHOLDER;
}

export function isRecapPassage(entry: LogEntry): boolean {
  if (entry.role !== LogEntryRole.GM) return false;
  const text = entry.text.trim();
  return text !== "" && text !== "..." && !isFailedReplyPlaceholder(entry);
}

export function readRecap(entry: { recap?: unknown }): string[] | undefined {
  if (!Array.isArray(entry.recap)) return undefined;
  return entry.recap.filter((line): line is string => typeof line === "string");
}

export function sameRecap(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

export function cleanRecapLines(lines: readonly string[]): string[] {
  return lines
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, MAX_RECAP_LINES)
    .map((line) => line.slice(0, MAX_RECAP_LINE_LENGTH));
}

export function parseRecapDraft(draft: string): string[] {
  return cleanRecapLines(draft.split(/\r?\n/));
}

export function patchLogEntry<T extends LogEntry>(
  entry: T,
  patch: Partial<LogEntry>,
): T {
  const next = { ...entry, ...patch };
  if (
    typeof patch.text === "string" &&
    !("recap" in patch) &&
    entry.recap !== undefined &&
    patch.text.trim() !== entry.text.trim()
  ) {
    delete next.recap;
  }
  return next;
}

export interface RecapWrite {
  entryId: string;
  lines: string[];
  sourceText: string;
  expectedRecap: string[] | undefined;
}

export function canApplyRecap(entry: LogEntry, write: RecapWrite): boolean {
  return (
    entry.text.trim() === write.sourceText.trim() &&
    sameRecap(readRecap(entry), write.expectedRecap)
  );
}

export interface RecapPassage {
  id: string;
  chainIndex: number;
  lines: string[];
}

export function recapPassages(entries: LogEntry[]): RecapPassage[] {
  return entries.flatMap((entry, chainIndex) => {
    if (!isRecapPassage(entry)) return [];
    const lines = readRecap(entry);
    return lines ? [{ id: entry.id, chainIndex, lines }] : [];
  });
}

export function formatRecapBlock(lines: readonly string[]): string {
  return `**Earlier in the story:**\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
