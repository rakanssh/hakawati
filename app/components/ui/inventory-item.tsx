import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import type { Item } from "@/types/item.type";

interface InventoryItemProps {
  item: Item;
  onUpdate: (
    id: string,
    updates: { name?: string; description?: string },
  ) => void;
  onRemove: (id: string) => void;
}

export function InventoryItem({
  item,
  onUpdate,
  onRemove,
}: InventoryItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editDescription, setEditDescription] = useState(
    item.description || "",
  );

  const handleSave = () => {
    if (!editName.trim()) return;
    onUpdate(item.id, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(item.name);
    setEditDescription(item.description || "");
    setIsEditing(false);
  };

  return (
    <div className="group relative flex items-center gap-3 rounded-xs border bg-card/50 p-3 transition-colors hover:bg-card overflow-hidden">
      {isEditing ? (
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Item name"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Description</span>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add context for the AI..."
              className="h-8 text-sm"
            />
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editName.trim()}>
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0 overflow-hidden flex items-center gap-2">
            <span className="font-medium text-sm truncate shrink-0 max-w-[40%]">
              {item.name}
            </span>
            {item.description && (
              <span className="text-muted-foreground shrink-0">·</span>
            )}
            {item.description && (
              <span className="text-xs text-muted-foreground truncate min-w-0">
                {item.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsEditing(true)}
              className="h-6 w-6"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(item.id)}
              className="h-6 w-6 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
