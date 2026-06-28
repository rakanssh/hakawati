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
  type CatalogAgeRating,
} from "@/types/catalog.type";
import type { Scenario } from "@/types/context.type";
import type { ScenarioPackageMetadata } from "@/lib/catalog-package";
import { Trans } from "@lingui/react/macro";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";

type PublishScenarioDialogProps = {
  open: boolean;
  scenario: Scenario | null;
  updating: boolean;
  thumbnailUploads: boolean;
  catalog: CatalogClientState;
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
  catalog,
  onOpenChange,
  onPublish,
}: PublishScenarioDialogProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [ageRating, setAgeRating] = useState<CatalogAgeRating>("general");
  const [tags, setTags] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !scenario) return;
    setTitle(scenario.name);
    setSummary(scenario.description);
    setLanguage(defaultLanguage());
    setAgeRating("general");
    setTags([]);
    setThumbnailFile(null);
  }, [open, scenario]);

  const canSubmit = Boolean(
    title.trim() && summary.trim() && language.trim() && tags.length > 0,
  );

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
                  ageRating,
                  tags,
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
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
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
              <CatalogTagInput
                value={tags}
                onChange={setTags}
                client={catalog}
                language={language}
                ageRating={ageRating}
                placeholder="magic, city"
                required
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
