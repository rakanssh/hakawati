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
