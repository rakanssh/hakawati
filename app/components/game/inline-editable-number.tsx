import { useEffect, useState, KeyboardEvent } from "react";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";

interface InlineEditableNumberProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (newValue: number) => void;
  className?: string;
}

export function InlineEditableNumber({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
}: InlineEditableNumberProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    if (!isEditing) {
      setDraft(String(value));
    }
  }, [value, isEditing]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) {
      let next = parsed;
      if (typeof min === "number") next = Math.max(next, min);
      if (typeof max === "number") next = Math.min(next, max);
      if (next !== value) onChange(next);
    }
    setIsEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(String(value));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        className={cn("h-7 w-20 text-right font-mono", className)}
        // type="number" // Looks fugly
        inputMode="numeric"
        step={step}
        min={min}
        max={max}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <button
      className={cn(
        "text-sm font-mono text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
      onClick={() => setIsEditing(true)}
      type="button"
      aria-label="Edit value"
    >
      {value}
    </button>
  );
}
