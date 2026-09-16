import type { ComponentProps } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Suggestion = { id: string; label: string };

type InputAccessibilityProps = Pick<
  ComponentProps<typeof Input>,
  "aria-label" | "aria-describedby" | "aria-invalid" | "disabled"
>;

export function ClearableInput({
  id,
  value,
  placeholder,
  onValueChange,
  ...inputProps
}: InputAccessibilityProps & {
  id: string;
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="relative">
      <Input
        {...inputProps}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-xs border-border/75 bg-background/70 px-14 text-center text-lg shadow-lg shadow-background/20 backdrop-blur-sm md:text-xl"
        autoFocus
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={inputProps.disabled}
          aria-label={t`Clear input`}
          className="absolute end-1.5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-xs px-0 text-base font-semibold leading-none text-muted-foreground hover:text-foreground"
          onClick={() => onValueChange("")}
        >
          X
        </Button>
      )}
    </div>
  );
}

export function SuggestedInput({
  id,
  value,
  placeholder,
  suggestions,
  selectedId,
  optionColumns = "sm:grid-cols-2 lg:grid-cols-3",
  allowCustom = true,
  onValueChange,
  onSuggestionSelect,
  onSurprise,
  ...inputProps
}: InputAccessibilityProps & {
  id: string;
  value: string;
  placeholder: string;
  suggestions: Suggestion[];
  selectedId: string | null;
  optionColumns?: string;
  allowCustom?: boolean;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (suggestion: Suggestion) => void;
  onSurprise?: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {allowCustom && (
        <ClearableInput
          {...inputProps}
          id={id}
          value={value}
          placeholder={placeholder}
          onValueChange={onValueChange}
        />
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {allowCustom ? (
                <Trans>Or choose one of these options.</Trans>
              ) : (
                <Trans>Choose one of these options.</Trans>
              )}
            </span>
            {onSurprise && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={inputProps.disabled}
                className="h-8 shrink-0 gap-1.5 rounded-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={onSurprise}
              >
                <Trans>Surprise Me</Trans>
              </Button>
            )}
          </div>
          <div
            className={cn("grid gap-2.5", optionColumns)}
            role="group"
            aria-label={inputProps["aria-label"]}
          >
            {suggestions.map((suggestion) => {
              const isSelected = selectedId === suggestion.id;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  disabled={inputProps.disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "group flex min-h-12 items-center gap-3 rounded-xs border bg-card/55 px-3 py-2.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:bg-card/80 hover:shadow-md focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50",
                    isSelected &&
                      "border-primary bg-primary/10 text-foreground ring-2 ring-primary/35",
                  )}
                  onClick={() => onSuggestionSelect(suggestion)}
                >
                  <span className="min-w-0 whitespace-normal break-words font-medium">
                    {suggestion.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
