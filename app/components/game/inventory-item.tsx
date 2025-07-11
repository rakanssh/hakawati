import { useGameStore } from "@/store/useGameStore";
import { PencilIcon, TrashIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useState, KeyboardEvent } from "react";
import { Input } from "../ui/input";

export function InventoryItem({ item }: { item: string }) {
  const { removeFromInventory, updateItem } = useGameStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(item);

  const handleFinishEditing = () => {
    if (editedValue.trim() && editedValue !== item) {
      updateItem(item, editedValue);
    } else {
      setEditedValue(item);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleFinishEditing();
    } else if (e.key === "Escape") {
      setEditedValue(item);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex flex-row items-center justify-between">
      {isEditing ? (
        <Input
          type="text"
          value={editedValue}
          onChange={(e) => setEditedValue(e.target.value)}
          onBlur={handleFinishEditing}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Badge variant="outline">{item}</Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => removeFromInventory(item)}>
              <TrashIcon className="w-4 h-4" />
              Remove
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <PencilIcon className="w-4 h-4" />
              Rename
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
