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
import { Item } from "@/types";

export function InventoryItem({ item }: { item: Item }) {
  const { updateItem, removeFromInventory } = useGameStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedValue, setEditedValue] = useState(item.name);

  const handleFinishEditing = () => {
    if (editedValue.trim() && editedValue !== item.name) {
      updateItem(item.id, { name: editedValue });
    } else {
      setEditedValue(item.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleFinishEditing();
    } else if (e.key === "Escape") {
      setEditedValue(item.name);
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
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger>
            <Badge
              variant={isDropdownOpen ? "highlight" : "outline"}
              className="cursor-pointer"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {item.name}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => removeFromInventory(item.id)}>
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
