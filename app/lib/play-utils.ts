import { LogEntryMode, LogEntryRole, LogEntry } from "@/types/log.type";

export interface Action {
  type: LogEntryMode;
  isRolling: boolean;
}

export function getPlaceholder(action: Action): string {
  let placeholder = "";
  switch (action.type) {
    case LogEntryMode.DO:
      placeholder = "You...";
      break;
    case LogEntryMode.SAY:
      placeholder = "You say...";
      break;
    case LogEntryMode.STORY:
      placeholder = "...";
      break;
    case LogEntryMode.DIRECT:
      placeholder = "Director's Note...";
      break;
  }
  if (action.isRolling) {
    placeholder = "🎲 " + placeholder;
  }
  return placeholder;
}

export interface LogBlock {
  role: LogEntryRole;
  chainId?: string;
  entries: LogEntry[];
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
