import { Badge } from "@/components/ui/badge";
import { ChartBarIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";
import { LLMAction } from "@/services/llm/schema";

export function ActionBadge({ action }: { action: LLMAction }) {
  if (action.type === "MODIFY_STAT" && action.payload.value! > 0) {
    return (
      <Badge variant="outline" className="ml-2 border-green-300/15">
        <ChartBarIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>
          {action.payload.value} {action.payload.name}
        </span>
      </Badge>
    );
  }
  if (action.type === "MODIFY_STAT" && action.payload.value! < 0) {
    return (
      <Badge variant="outline" className="ml-2 border-red-300/15">
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
      <Badge variant="outline" className="ml-2 border-green-300/15">
        <ShoppingBagIcon className="w-4 h-4 mr-2 text-green-300" />
        <span>{action.payload.item}</span>
      </Badge>
    );
  }
  if (action.type === "REMOVE_FROM_INVENTORY") {
    return (
      <Badge variant="outline" className="ml-2 border-red-300/15">
        <Trash2Icon className="w-4 h-4 mr-2 text-red-300" />
        <span>{action.payload.item}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-2">
      <span>
        {action.payload.name} {action.payload.value}
      </span>
    </Badge>
  );
}
