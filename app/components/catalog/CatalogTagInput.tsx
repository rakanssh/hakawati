import { useId, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useCatalogTagSuggestions } from "@/hooks/useCatalogScenarios";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import type { CatalogTagSort } from "@/types/catalog.type";
import { splitCatalogTagInput, validateCatalogTags } from "@/lib/catalog-tags";

type CatalogTagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  client: CatalogClientState;
  sort?: CatalogTagSort;
  search?: string;
  placeholder?: string;
  "aria-label"?: string;
  required?: boolean;
  disabled?: boolean;
};

export function CatalogTagInput({
  value,
  onChange,
  client,
  sort = "popular",
  search,
  placeholder,
  "aria-label": ariaLabel,
  required = false,
  disabled = false,
}: CatalogTagInputProps) {
  const { t } = useLingui();
  const listId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [error, setError] = useState("");
  const suggestions = useCatalogTagSuggestions(
    { ...client, enabled: client.enabled && focused && !disabled },
    useMemo(
      () => ({
        q: input,
        search,
        tag: value,
        sort,
        limit: 8,
      }),
      [input, search, sort, value],
    ),
  );
  const remainingSuggestions = suggestions.items.filter(
    (item) => !value.includes(item.tag),
  );
  const suggestionsOpen =
    focused && !dismissed && !disabled && remainingSuggestions.length > 0;
  const activeIndex = remainingSuggestions.findIndex(
    (item) => item.tag === activeTag,
  );
  const errorMessage =
    error || (required && value.length === 0 ? t`Add at least one tag.` : "");

  function setTags(tags: string[]) {
    const result = validateCatalogTags(tags);
    onChange(result.tags);
    setError(
      result.invalid.length
        ? t`Tags can only use letters, numbers, and hyphens.`
        : result.tooLong.length
          ? t`Tags must be 32 characters or shorter.`
          : result.tooMany
            ? t`Use 16 tags or fewer.`
            : "",
    );
    setActiveTag(null);
  }

  function addInput(raw: string) {
    const parts = splitCatalogTagInput(raw);
    if (!parts.length) return;
    setTags([...value, ...parts]);
    setInput("");
  }

  function selectSuggestion(tag: string) {
    setTags([...value, tag]);
    setInput("");
    setDismissed(true);
    inputRef.current?.focus();
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-xs border border-input bg-background px-2 py-1 shadow-xs">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setTags(value.filter((item) => item !== tag))}
              aria-label={t`Remove ${tag}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover
          open={suggestionsOpen}
          onOpenChange={(open) => {
            if (!open) setDismissed(true);
          }}
        >
          <PopoverAnchor asChild>
            <Input
              ref={inputRef}
              className="h-7 min-w-28 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              value={input}
              disabled={disabled}
              role="combobox"
              aria-label={ariaLabel ?? t`Tags`}
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
              aria-controls={suggestionsOpen ? listId : undefined}
              aria-activedescendant={
                suggestionsOpen && activeIndex >= 0
                  ? `${listId}-${activeIndex}`
                  : undefined
              }
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? errorId : undefined}
              placeholder={value.length ? "" : (placeholder ?? t`Add tag`)}
              onFocus={() => {
                setFocused(true);
                setDismissed(false);
              }}
              onBlur={(event) => {
                if (suggestionsRef.current?.contains(event.relatedTarget))
                  return;
                setFocused(false);
                setActiveTag(null);
                addInput(input);
              }}
              onChange={(event) => {
                setInput(event.target.value);
                setActiveTag(null);
                setDismissed(false);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (
                  (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                  remainingSuggestions.length > 0
                ) {
                  event.preventDefault();
                  setDismissed(false);
                  const nextIndex =
                    event.key === "ArrowDown"
                      ? (activeIndex + 1) % remainingSuggestions.length
                      : activeIndex <= 0
                        ? remainingSuggestions.length - 1
                        : activeIndex - 1;
                  setActiveTag(remainingSuggestions[nextIndex].tag);
                  return;
                }
                if (event.key === "Escape" && suggestionsOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setDismissed(true);
                  setActiveTag(null);
                  return;
                }
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  if (
                    event.key === "Enter" &&
                    suggestionsOpen &&
                    activeIndex >= 0
                  ) {
                    selectSuggestion(remainingSuggestions[activeIndex].tag);
                  } else {
                    addInput(input);
                  }
                }
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            ref={suggestionsRef}
            id={listId}
            role="listbox"
            aria-label={t`Suggested tags`}
            align="start"
            className="w-64 p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (event.target === inputRef.current) event.preventDefault();
            }}
          >
            {remainingSuggestions.map((item, index) => (
              <Button
                key={item.tag}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                variant="ghost"
                className={`h-8 w-full justify-between px-2 ${index === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(item.tag)}
              >
                <span>{item.tag}</span>
                <span className="text-xs text-muted-foreground">
                  {item.count}
                </span>
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      {errorMessage ? (
        <p id={errorId} role="status" className="text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
