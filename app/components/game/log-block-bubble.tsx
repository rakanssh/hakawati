import { LogEntry, LogEntryRole } from "@/types/log.type";
import { ReactNode, Fragment } from "react";
import { LLMAction } from "@/services/llm/schema";
import { Badge } from "../ui/badge";
import { ChartBarIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";

export type LogBlock = {
  role: LogEntryRole;
  chainId?: string;
  entries: LogEntry[];
};

interface LogBlockBubbleProps {
  block: LogBlock;
  onEditStart?: (entryId: string) => void;
  renderEntry?: (entry: LogEntry, onClick: () => void) => ReactNode;
}

export function LogBlockBubble({
  block,
  onEditStart,
  renderEntry,
}: LogBlockBubbleProps) {
  const actions: LLMAction[] = block.entries.flatMap((e) => e.actions || []);
  return (
    <div className="flex flex-col items-start ml-2">
      <div className="inline whitespace-pre-wrap break-words">
        {block.entries.map((e) => {
          const onClick = () => onEditStart?.(e.id);
          if (renderEntry) {
            return <Fragment key={e.id}>{renderEntry(e, onClick)}</Fragment>;
          }
          return (
            <span key={e.id} className="cursor-pointer" onClick={onClick}>
              {e.text}
            </span>
          );
        })}
      </div>
      <div className="flex flex-row mt-2">
        {actions.length > 0 && (
          <div className="flex flex-row flex-wrap gap-y-1">
            {actions.map((action, idx) => (
              <ActionBadge key={`${action.type}-${idx}`} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: LLMAction }) {
  if (action.type === "MODIFY_STAT" && action.payload.value! > 0) {
    return (
      <Badge variant="outline" className="ml-2 border-green-300/15 rounded-xs">
        <ChartBarIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>
          {action.payload.value} {action.payload.name}
        </span>
      </Badge>
    );
  }
  if (action.type === "MODIFY_STAT" && action.payload.value! < 0) {
    return (
      <Badge variant="outline" className="ml-2 border-red-300/15 rounded-xs">
        <ChartBarIcon className="w-4 h-4 mr-2 text-red-300" />
        <span>
          {action.payload.value} {action.payload.name}
        </span>
      </Badge>
    );
  }
  if (action.type === "MODIFY_STAT" && action.payload.value == 0) {
    return null;
  }
  if (action.type === "ADD_TO_INVENTORY") {
    return (
      <Badge variant="outline" className="ml-2 border-green-300/15 rounded-xs ">
        <ShoppingBagIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>{action.payload.item}</span>
      </Badge>
    );
  }
  if (action.type === "REMOVE_FROM_INVENTORY") {
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

export default LogBlockBubble;
