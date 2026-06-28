import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATALOG_AGE_RATINGS,
  CATALOG_CATEGORIES,
  type CatalogAgeRating,
  type CatalogCategory,
} from "@/types/catalog.type";
import type { Scenario } from "@/types/context.type";
import type { ScenarioPackageMetadata } from "@/lib/catalog-package";
import { Trans } from "@lingui/react/macro";

type PublishScenarioDialogProps = {
  open: boolean;
  scenario: Scenario | null;
  updating: boolean;
  thumbnailUploads: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (input: {
    metadata: ScenarioPackageMetadata;
    thumbnailFile?: File | null;
  }) => Promise<void>;
};

function defaultLanguage() {
  return navigator.language?.split("-")[0] || "en";
}

export function PublishScenarioDialog({
  open,
  scenario,
  updating,
  thumbnailUploads,
  onOpenChange,
  onPublish,
}: PublishScenarioDialogProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [category, setCategory] = useState<CatalogCategory>("other");
  const [ageRating, setAgeRating] = useState<CatalogAgeRating>("general");
  const [tags, setTags] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !scenario) return;
    setTitle(scenario.name);
    setSummary(scenario.description);
    setLanguage(defaultLanguage());
    setCategory("other");
    setAgeRating("general");
    setTags("");
    setThumbnailFile(null);
  }, [open, scenario]);

  const canSubmit = Boolean(title.trim() && summary.trim() && language.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {updating ? (
              <Trans>Publish update</Trans>
            ) : (
              <Trans>Publish scenario</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Public catalog metadata is copied into a frozen version.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSubmit) return;
            setSubmitting(true);
            try {
              await onPublish({
                metadata: {
                  title,
                  summary,
                  language,
                  category,
                  ageRating,
                  tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                },
                thumbnailFile,
              });
              onOpenChange(false);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>
                <Trans>Title</Trans>
              </Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>
                <Trans>Language</Trans>
              </Label>
              <Input
                value={language}
                maxLength={16}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>
              <Trans>Summary</Trans>
            </Label>
            <Textarea
              value={summary}
              maxLength={600}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>
                <Trans>Category</Trans>
              </Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as CatalogCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>
                <Trans>Age rating</Trans>
              </Label>
              <Select
                value={ageRating}
                onValueChange={(value) =>
                  setAgeRating(value as CatalogAgeRating)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_AGE_RATINGS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>
                <Trans>Tags</Trans>
              </Label>
              <Input
                value={tags}
                placeholder="magic, city"
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>
          {thumbnailUploads ? (
            <div className="grid gap-2">
              <Label>
                <Trans>Public thumbnail</Trans>
              </Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setThumbnailFile(event.target.files?.[0] ?? null)
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {updating ? (
                <Trans>Publish update</Trans>
              ) : (
                <Trans>Publish</Trans>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
