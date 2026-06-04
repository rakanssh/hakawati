import { LogEntryMode, LogEntryRole, LogEntry } from "@/types/log.type";
import { msg } from "@lingui/core/macro";
import { MessageDescriptor } from "@lingui/core";

export interface Action {
  type: LogEntryMode;
  isRolling: boolean;
}

export function getPlaceholderMessage(action: Action): MessageDescriptor {
  switch (action.type) {
    case LogEntryMode.DO:
      return action.isRolling ? msg`🎲 You...` : msg`You...`;
    case LogEntryMode.SAY:
      return action.isRolling ? msg`🎲 You say...` : msg`You say...`;
    case LogEntryMode.STORY:
    case LogEntryMode.CONTINUE:
      return action.isRolling ? msg`🎲 ...` : msg`...`;
    case LogEntryMode.DIRECT:
      return action.isRolling
        ? msg`🎲 Director's Note...`
        : msg`Director's Note...`;
    default: {
      const _exhaustive: never = action.type;
      return _exhaustive;
    }
  }
}

export interface LogBlock {
  role: LogEntryRole;
  chainId?: string;
  entries: LogEntry[];
}

export interface NarrationItem {
  id: string;
  text: string;
  label: string;
}

export function groupLogEntriesIntoBlocks(log: LogEntry[]): LogBlock[] {
  const result: LogBlock[] = [];
  for (const entry of log) {
    const prev = result[result.length - 1] as LogBlock | undefined;
    const entryChain =
      entry.role === LogEntryRole.GM ? (entry.chainId ?? entry.id) : undefined;
    const prevChain = prev?.chainId;
    const canChain =
      entry.role === LogEntryRole.GM &&
      prev?.role === LogEntryRole.GM &&
      prevChain === entryChain;
    if (canChain) {
      prev.entries.push(entry);
    } else {
      result.push({
        role: entry.role,
        chainId: entryChain,
        entries: [entry],
      });
    }
  }
  return result;
}

export function getLatestGmEntryId(blocks: LogBlock[]): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.role !== LogEntryRole.GM) continue;
    return block.entries.at(-1)?.id ?? null;
  }
  return null;
}

export function getLogBlockNarrationItem(
  block: LogBlock,
): NarrationItem | null {
  if (block.role !== LogEntryRole.GM) return null;
  const text = block.entries
    .map((entry) => entry.text)
    .join("")
    .trim();
  if (!text) return null;
  return {
    id: `gm:${block.chainId ?? block.entries[0].id}`,
    text,
    label: "Story narration",
  };
}

export function getStoryEntryNarrationItem(
  entry: LogEntry,
  idPrefix = "entry",
): NarrationItem | null {
  const text = entry.text.trim();
  if (!text) return null;
  const isStoryEntry =
    entry.role === LogEntryRole.PLAYER && entry.mode === LogEntryMode.STORY;
  if (!isStoryEntry) return null;
  return {
    id: `${idPrefix}:${entry.id}`,
    text,
    label: "Story input",
  };
}

export function getAutoNarrationItem(entry: LogEntry): NarrationItem | null {
  const text = entry.text.trim();
  if (!text) return null;
  if (entry.role === LogEntryRole.GM) {
    return {
      id: `auto:${entry.id}`,
      text,
      label: "Story narration",
    };
  }
  return getStoryEntryNarrationItem(entry, "auto");
}
