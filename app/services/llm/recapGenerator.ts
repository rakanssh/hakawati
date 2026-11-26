import { z } from "zod";
import { getActiveStoryRecapPrompt } from "@/prompts";
import { STORY_RECAP_OUTPUT_FORMAT } from "@/prompts/system";
import { cleanRecapLines, readRecap } from "@/lib/recaps";
import { useSettingsStore } from "@/store/useSettingsStore";
import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { ReasoningEffort, ResponseMode } from "@/types";
import {
  lowerRoleReasoningEffort,
  resolveModelRole,
  sendRoleChat,
} from "@/services/llm";
import { injectMode } from "./contextAssembly";
import { ChatMessage } from "./schema";
import { countMessageTokens } from "./tokenCounter";

export interface RecapRangeEntry {
  entry: LogEntry;
  pending: boolean;
}

export interface RecapRequest {
  plot?: string;
  storySoFar: string[];
  range: RecapRangeEntry[];
}

const OUTPUT_TOKENS_BASE = 512;
const OUTPUT_TOKENS_PER_PASSAGE = 80;
const OUTPUT_TOKENS_MAX = 4096;
const MIN_INPUT_TOKENS = 1500;

const RecapResponseSchema = z.object({
  recaps: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      lines: z
        .union([z.array(z.unknown()), z.string(), z.null()])
        .optional()
        .transform((lines) =>
          typeof lines === "string"
            ? lines.split(/\r?\n/)
            : (lines ?? []).filter(
                (line): line is string => typeof line === "string",
              ),
        ),
    }),
  ),
});

export function recapOutputTokens(pendingCount: number): number {
  return Math.min(
    OUTPUT_TOKENS_MAX,
    OUTPUT_TOKENS_BASE + OUTPUT_TOKENS_PER_PASSAGE * pendingCount,
  );
}

// A recap request costs about as much as one narrator request.
export function recapInputBudget(pendingCount: number): number {
  const { model } = resolveModelRole("utility");
  const { contextWindow, maxTokens } = useSettingsStore.getState();
  const narratorPrompt = Math.max(MIN_INPUT_TOKENS, contextWindow - maxTokens);
  const helperRoom = model.contextLength
    ? model.contextLength - recapOutputTokens(pendingCount)
    : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(narratorPrompt, helperRoom));
}

export function recapSystemPrompt(): string {
  return `${getActiveStoryRecapPrompt()}\n\n${STORY_RECAP_OUTPUT_FORMAT}`;
}

function formatEntry(entry: LogEntry, shortId: string | undefined): string {
  if (entry.role === LogEntryRole.PLAYER) {
    return `[Player]\n${injectMode(entry.text, entry.mode).trim()}`;
  }
  if (shortId) return `[Narrator ${shortId}]\n${entry.text.trim()}`;
  const lines = readRecap(entry) ?? [];
  return `[Narrator, already recorded]\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function buildRecapMessages(request: RecapRequest): {
  messages: ChatMessage[];
  ids: Map<string, string>;
} {
  const ids = new Map<string, string>();
  const parts: string[] = [];
  if (request.plot?.trim()) parts.push(`Plot:\n${request.plot.trim()}`);
  if (request.storySoFar.length > 0) {
    parts.push(
      `Story so far:\n${request.storySoFar.map((line) => `- ${line}`).join("\n")}`,
    );
  }

  const passages: string[] = [];
  for (const { entry, pending } of request.range) {
    if (
      entry.role === LogEntryRole.PLAYER &&
      entry.mode === LogEntryMode.CONTINUE
    ) {
      continue;
    }
    if (entry.role === LogEntryRole.GM && !pending) {
      if (!readRecap(entry)?.length) continue;
      passages.push(formatEntry(entry, undefined));
      continue;
    }
    if (entry.role === LogEntryRole.GM) {
      const shortId = `p${ids.size + 1}`;
      ids.set(shortId, entry.id);
      passages.push(formatEntry(entry, shortId));
      continue;
    }
    passages.push(formatEntry(entry, undefined));
  }
  parts.push(`Passages:\n\n${passages.join("\n\n")}`);

  return {
    messages: [
      { role: "system", content: recapSystemPrompt() },
      { role: "user", content: parts.join("\n\n") },
    ],
    ids,
  };
}

export function countRecapRequestTokens(request: RecapRequest): number {
  return countMessageTokens(buildRecapMessages(request).messages);
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export class RecapParseError extends Error {}

export function parseRecapResponse(
  content: string,
  ids: Map<string, string>,
): Map<string, string[]> {
  let parsed: z.infer<typeof RecapResponseSchema>;
  try {
    parsed = RecapResponseSchema.parse(JSON.parse(extractJson(content)));
  } catch (error) {
    throw new RecapParseError(
      `Story recap reply was not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const result = new Map<string, string[]>();
  for (const item of parsed.recaps) {
    const entryId = ids.get(item.id.trim());
    if (entryId && !result.has(entryId)) {
      result.set(entryId, cleanRecapLines(item.lines));
    }
  }
  if (result.size * 2 < ids.size) {
    throw new RecapParseError("Story recap reply left out most passages.");
  }
  for (const entryId of ids.values()) {
    if (!result.has(entryId)) result.set(entryId, []);
  }
  return result;
}

function lowestUtilityEffort(): ReasoningEffort | undefined {
  let lowest: ReasoningEffort | undefined;
  for (
    let next = lowerRoleReasoningEffort("utility");
    next !== undefined && next !== lowest;
    next = lowerRoleReasoningEffort("utility", next)
  ) {
    lowest = next;
  }
  return lowest;
}

export async function generateRecaps(
  request: RecapRequest,
  signal?: AbortSignal,
): Promise<Map<string, string[]>> {
  const { model } = resolveModelRole("utility");
  const { messages, ids } = buildRecapMessages(request);
  if (ids.size === 0) return new Map();

  const response = await sendRoleChat(
    "utility",
    {
      model: model.id,
      messages,
      stream: false,
      max_tokens: recapOutputTokens(ids.size),
      reasoningEffort: lowestUtilityEffort(),
      responseMode: ResponseMode.FREE_FORM,
    },
    signal,
  );
  return parseRecapResponse(response.content, ids);
}
