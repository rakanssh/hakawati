import { Button } from "../ui/button";
import { PlusIcon } from "lucide-react";
import { ReactNode } from "react";

interface AddIconButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  icon?: ReactNode;
}

export function AddIconButton({
  onClick,
  ariaLabel = "Open add drawer",
  icon,
}: AddIconButtonProps) {
  return (
    <Button
      className="p-0 w-6 h-5"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon ?? <PlusIcon className="w-4 h-4" />}
    </Button>
  );
}
