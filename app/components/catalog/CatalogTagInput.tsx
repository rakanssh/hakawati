import { useMemo, useState } from "react";
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
  placeholder?: string;
  required?: boolean;
};

export function CatalogTagInput({
  value,
  onChange,
  client,
  sort = "popular",
  placeholder = "Add tag",
  required = false,
}: CatalogTagInputProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const suggestions = useCatalogTagSuggestions(
    client,
    useMemo(
      () => ({
        q: input,
        tag: value,
        sort,
        limit: 8,
      }),
      [input, sort, value],
    ),
  );
  const remainingSuggestions = suggestions.items.filter(
    (item) => !value.includes(item.tag),
  );

  function setTags(tags: string[]) {
    const result = validateCatalogTags(tags);
    onChange(result.tags);
    setError(tagValidationMessage(result));
  }

  function addInput(raw: string) {
    const parts = splitCatalogTagInput(raw);
    if (!parts.length) return;
    setTags([...value, ...parts]);
    setInput("");
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-xs border border-input bg-background px-2 py-1 shadow-xs">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => setTags(value.filter((item) => item !== tag))}
              aria-label={`Remove ${tag}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover open={focused && remainingSuggestions.length > 0}>
          <PopoverAnchor asChild>
            <Input
              className="h-7 min-w-28 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              value={input}
              placeholder={value.length ? "" : placeholder}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setFocused(false), 100);
                addInput(input);
              }}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addInput(input);
                }
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-64 p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            {remainingSuggestions.map((item) => (
              <Button
                key={item.tag}
                type="button"
                variant="ghost"
                className="h-8 w-full justify-between px-2"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTags([...value, item.tag]);
                  setInput("");
                }}
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
      {error || (required && value.length === 0) ? (
        <p className="text-xs text-destructive">
          {error || "Add at least one tag."}
        </p>
      ) : null}
    </div>
  );
}

function tagValidationMessage(result: ReturnType<typeof validateCatalogTags>) {
  if (result.invalid.length)
    return "Tags can only use letters, numbers, and hyphens.";
  if (result.tooLong.length) return "Tags must be 32 characters or shorter.";
  if (result.tooMany) return "Use 16 tags or fewer.";
  return "";
}
