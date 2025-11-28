import { useEffect, useState, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger>
          <Badge
            variant={isDropdownOpen ? "highlight" : "outline"}
            className={cn("hover:bg-accent/50 transition-colors", className)}
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
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            variant="destructive"
          >
            <TrashIcon className="w-4 h-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {label} will be permanently deleted.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
