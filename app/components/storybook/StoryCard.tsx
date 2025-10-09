import React from "react";
import {
  StoryCard as StoryCardType,
  StorybookCategory,
} from "@/types/context.type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PinIcon, PinOffIcon, EditIcon, TrashIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StoryCardProps = {
  entry: StoryCardType;
  onRemove: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onEdit?: (entry: StoryCardType) => void;
};

const CATEGORY_COLORS: Record<StorybookCategory, string> = {
  [StorybookCategory.CHARACTER]:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  [StorybookCategory.THING]:
    "bg-green-500/10 text-green-700 dark:text-green-400",
  [StorybookCategory.PLACE]:
    "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  [StorybookCategory.CONCEPT]:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  [StorybookCategory.UNCATEGORIZED]:
    "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

export function StoryCard({
  entry,
  onRemove,
  onPin,
  onEdit,
}: StoryCardProps): React.JSX.Element {
  const handlePinToggle = () => {
    onPin(entry.id, !entry.isPinned);
  };

  return (
    <div
      className={cn(
        "group relative rounded-xs border p-3 transition-all hover:shadow-sm bg-primary/5",
        entry.isPinned && "border-primary/50",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm truncate">{entry.title}</h3>
            {entry.isPinned && (
              <PinIcon className="size-3 text-primary shrink-0" />
            )}
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "text-xs h-5 px-1.5",
              CATEGORY_COLORS[entry.category],
            )}
          >
            {entry.category}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handlePinToggle}
            title={entry.isPinned ? "Unpin" : "Pin"}
            aria-label={entry.isPinned ? "Unpin" : "Pin"}
          >
            {entry.isPinned ? (
              <PinOffIcon className="size-3.5" />
            ) : (
              <PinIcon className="size-3.5" />
            )}
          </Button>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onEdit(entry)}
              title="Edit"
              aria-label="Edit"
            >
              <EditIcon className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onRemove(entry.id)}
            title="Delete"
            aria-label="Delete"
          >
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-muted-foreground mb-2 line-clamp-3">
        {entry.content}
      </p>

      {/* Triggers */}
      {entry.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.triggers.map((trigger, index) => (
            <Badge key={index} variant="outline" className="text-xs h-5 px-1.5">
              {trigger}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
