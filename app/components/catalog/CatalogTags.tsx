import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function CatalogTags({
  tags,
  limit = 2,
  onSelect,
}: {
  tags: string[];
  limit?: number;
  onSelect: (tag: string) => void;
}) {
  const { t } = useLingui();
  if (!tags.length) return null;
  const tagButton = (tag: string) => (
    <Badge key={tag} variant="outline" asChild>
      <button
        type="button"
        className="h-6 max-w-40 cursor-pointer hover:bg-accent"
        title={tag}
        aria-label={t`Browse tag: ${tag}`}
        onClick={() => onSelect(tag)}
      >
        <span className="truncate">{tag}</span>
      </button>
    </Badge>
  );

  return (
    <div
      className="flex min-w-0 flex-wrap gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {tags.slice(0, limit).map(tagButton)}
      {tags.length > limit && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant="outline" asChild>
              <button
                type="button"
                className="h-6 cursor-pointer hover:bg-accent"
                aria-label={t`Show all tags`}
              >
                +{tags.length - limit}
              </button>
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2 p-3" align="start">
            <p className="text-sm font-medium">
              <Trans>Tags</Trans>
            </p>
            <div className="flex flex-wrap gap-1">{tags.map(tagButton)}</div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
