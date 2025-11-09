import { useEffect, useMemo, useState, KeyboardEvent, FocusEvent } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

type BaseNumberInputProps = {
  value?: number | null;
  min?: number;
  max?: number;
  step?: number;
  align?: "left" | "right";
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

type NumberInputPropsWithNull = BaseNumberInputProps & {
  allowNull: true;
  onValueCommit: (nextValue: number | null) => void;
};

type NumberInputPropsWithoutNull = BaseNumberInputProps & {
  allowNull?: false;
  onValueCommit: (nextValue: number) => void;
};

type NumberInputProps = NumberInputPropsWithNull | NumberInputPropsWithoutNull;

export function NumberInput({
  value,
  min,
  max,
  step = 1,
  align = "left",
  className,
  disabled,
  placeholder,
  allowNull = false,
  onValueCommit,
  ...aria
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(
    value === undefined || value === null ? "" : String(value),
  );
  const [hasFocus, setHasFocus] = useState<boolean>(false);

  useEffect(() => {
    if (!hasFocus) {
      setDraft(value === undefined || value === null ? "" : String(value));
    }
  }, [value, hasFocus]);

  const inputMode = useMemo<"numeric" | "decimal">(() => {
    const isDecimal = typeof step === "number" && !Number.isInteger(step);
    return isDecimal ? "decimal" : "numeric";
  }, [step]);

  function clampNumber(n: number): number {
    let result = n;
    if (typeof min === "number") result = Math.max(result, min);
    if (typeof max === "number") result = Math.min(result, max);
    return result;
  }

  function commit(nextRaw?: string) {
    const raw = nextRaw ?? draft;
    const parsed = Number(raw);
    let next: number | null;

    if (raw === "" && allowNull) {
      next = null;
    } else if (Number.isFinite(parsed)) {
      next = clampNumber(parsed);
    } else if (typeof min === "number") {
      next = min;
    } else if (allowNull) {
      next = null;
    } else {
      next = 0;
    }

    const current = typeof value === "number" ? value : null;
    if (current !== next) {
      onValueCommit(next as never);
    }
    setDraft(next === null ? "" : String(next));
  }

  function handleBlur(_e: FocusEvent<HTMLInputElement>) {
    commit();
    setHasFocus(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      commit();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setDraft(value === undefined || value === null ? "" : String(value));
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <Input
      inputMode={inputMode}
      step={step}
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setHasFocus(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        align === "right" ? "text-right" : "text-left",
        "font-mono",
        className,
      )}
      aria-label={aria["aria-label"]}
    />
  );
}
