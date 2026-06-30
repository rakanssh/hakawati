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
  const [tags, setTags] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !scenario) return;
    setTitle(scenario.name);
    setSummary(scenario.description);
    setTags([]);
    setThumbnailFile(null);
  }, [open, scenario]);

  const canSubmit = Boolean(title.trim() && summary.trim() && tags.length > 0);

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
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>
                <Trans>Title</Trans>
              </Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>
                <Trans>Tags</Trans>
              </Label>
              <CatalogTagInput
                value={tags}
                onChange={setTags}
                client={catalog}
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
