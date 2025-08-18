import { useEffect, useState, KeyboardEvent } from "react";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PencilIcon, TrashIcon } from "lucide-react";

interface InlineEditableBadgeProps {
  label: string;
  onRename: (newName: string) => void;
  onRemove: () => void;
  className?: string;
}

export function InlineEditableBadge({
  label,
  onRename,
  onRemove,
  className,
}: InlineEditableBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedValue, setEditedValue] = useState(label);

  useEffect(() => {
    setEditedValue(label);
  }, [label]);

  const handleFinishEditing = () => {
    const trimmed = editedValue.trim();
    if (trimmed && trimmed !== label) {
      onRename(trimmed);
    } else {
      setEditedValue(label);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleFinishEditing();
    } else if (e.key === "Escape") {
      setEditedValue(label);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        type="text"
        value={editedValue}
        onChange={(e) => setEditedValue(e.target.value)}
        onBlur={handleFinishEditing}
        onKeyDown={handleKeyDown}
        autoFocus
        className={className}
      />
    );
  }

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger>
        <Badge
          variant={isDropdownOpen ? "highlight" : "outline"}
          className={className}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          {label}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => setIsEditing(true)}>
          <PencilIcon className="w-4 h-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRemove} variant="destructive">
          <TrashIcon className="w-4 h-4" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
