import {
  ChartBarIcon,
  HandIcon,
  MegaphoneIcon,
  SpeechIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from 'lucide-react';
import { LogEntry, LogEntryMode } from '@/types/log.type';
import { Badge } from '../ui/badge';
import { LLMAction } from '@/services/llm/schema';

export interface LogEntryBubbleProps {
  entry: LogEntry;
}

export function LogEntryBubble({ entry }: LogEntryBubbleProps) {
  const { text, mode, actions } = entry;
  if (mode === LogEntryMode.SAY) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-blue-300/15">
        <SpeechIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">{text}</p>
      </div>
    );
  }

  if (mode === LogEntryMode.DO) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-amber-300/15">
        <HandIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">{text}</p>
      </div>
    );
  }

  if (mode === LogEntryMode.DIRECT) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-green-300/15">
        <MegaphoneIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">{text}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start ml-2">
      <p className="inline whitespace-pre-wrap break-words">{text}</p>
      <div className="flex flex-row mt-2">
        {actions && actions.length > 0 && (
          <div className="flex flex-row">
            {actions.map((action) => (
              <ActionBadge key={action.type} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Returns the colored of the badge for the given action.
 * + Stats: green
 * - Stats: red
 * + Inventory: green
 * - Inventory: red
 * @param action
 */
function ActionBadge({ action }: { action: LLMAction }) {
  if (action.type === 'MODIFY_STAT' && action.payload.value! > 0) {
    return (
      <Badge variant="outline" className="ml-2 border-green-300/15 rounded-xs">
        <ChartBarIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>
          {action.payload.value} {action.payload.name}
        </span>
      </Badge>
    );
  }
  if (action.type === 'MODIFY_STAT' && action.payload.value! < 0) {
    return (
      <Badge variant="outline" className="ml-2 border-red-300/15 rounded-xs">
        <ChartBarIcon className="w-4 h-4 mr-2 text-red-300  " />
        <span>
          {action.payload.value} {action.payload.name}
        </span>
      </Badge>
    );
  }
  if (action.type === 'MODIFY_STAT' && action.payload.value == 0) {
    return;
  }
  if (action.type === 'ADD_TO_INVENTORY') {
    return (
      <Badge variant="outline" className="ml-2 border-green-300/15 rounded-xs ">
        <ShoppingBagIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>{action.payload.item}</span>
      </Badge>
    );
  }
  if (action.type === 'REMOVE_FROM_INVENTORY') {
    return (
      <Badge variant="outline" className="ml-2 border-red-300/15 rounded-xs">
        <Trash2Icon className="w-4 h-4 mr-2 text-red-300" />
        <span>{action.payload.item}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-2 rounded-xs">
      <span>
        {action.payload.name} {action.payload.value}
      </span>
    </Badge>
  );
}
