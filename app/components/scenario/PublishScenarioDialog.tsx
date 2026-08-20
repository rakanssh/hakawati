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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { Scenario } from "@/types/context.type";
import type { ScenarioPackageMetadata } from "@/lib/catalog-package";
import { Trans } from "@lingui/react/macro";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import {
  fetchCurrentCatalogPolicies,
  publishingAcceptanceFor,
  type CatalogCurrentPolicies,
  type CatalogPublishingAcceptance,
} from "@/services/catalog.service";
import { openUrl } from "@tauri-apps/plugin-opener";

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
    policyAcceptance: CatalogPublishingAcceptance;
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
  const [policies, setPolicies] = useState<CatalogCurrentPolicies | null>(null);
  const [policiesError, setPoliciesError] = useState(false);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !scenario) return;
    setTitle(scenario.name);
    setSummary(scenario.description);
    setTags([]);
    setThumbnailFile(null);
    setPolicies(null);
    setPoliciesError(false);
    setPoliciesAccepted(false);
    if (!catalog.publicTransport) {
      setPoliciesError(true);
      return;
    }
    let cancelled = false;
    void fetchCurrentCatalogPolicies(catalog.publicTransport)
      .then((current) => {
        if (!cancelled) setPolicies(current);
      })
      .catch(() => {
        if (!cancelled) setPoliciesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.publicTransport, open, scenario]);

  const canSubmit = Boolean(
    title.trim() &&
      summary.trim() &&
      tags.length > 0 &&
      policies &&
      policiesAccepted,
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
            const policyAcceptance = publishingAcceptanceFor(policies!);
            setSubmitting(true);
            try {
              await onPublish({
                metadata: {
                  title,
                  summary,
                  tags,
                },
                thumbnailFile,
                policyAcceptance,
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
          <div className="grid gap-2 rounded-xs border p-3 text-sm">
            {policiesError ? (
              <p className="text-destructive">
                <Trans>Publishing policies could not be loaded.</Trans>
              </p>
            ) : policies ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="publishing-policy-acceptance"
                  checked={policiesAccepted}
                  onCheckedChange={(checked) =>
                    setPoliciesAccepted(checked === true)
                  }
                />
                <div className="grid gap-1 leading-relaxed">
                  <Label htmlFor="publishing-policy-acceptance">
                    <Trans>
                      I agree to the publishing rules and understand that public
                      scenarios are moderated and may be removed.
                    </Trans>
                  </Label>
                  <div className="flex flex-wrap gap-x-3">
                    {policies.policies
                      .filter((policy) => policy.requiredForPublishing)
                      .map((policy) => (
                        <Button
                          key={policy.key}
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => void openUrl(policy.url)}
                        >
                          {policy.key === "terms" ? (
                            <Trans>Terms of Service</Trans>
                          ) : (
                            <Trans>Community Guidelines</Trans>
                          )}
                        </Button>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                <Trans>Loading publishing policies...</Trans>
              </p>
            )}
          </div>
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
