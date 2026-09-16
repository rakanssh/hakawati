import { useEffect, useId, useRef, useState } from "react";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import {
  fetchCurrentCatalogPolicies,
  getOwnedCatalogScenario,
  publishingAcceptanceFor,
  type CatalogCurrentPolicies,
  type CatalogPublishingAcceptance,
} from "@/services/catalog.service";
import { getScenarioPublishLink } from "@/repositories/scenario-publish-link.repository";
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
  const { t } = useLingui();
  const titleId = useId();
  const summaryId = useId();
  const formSession = useRef(0);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [policies, setPolicies] = useState<CatalogCurrentPolicies | null>(null);
  const [policiesError, setPoliciesError] = useState(false);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metadataReady, setMetadataReady] = useState(false);
  const [metadataError, setMetadataError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    formSession.current += 1;
    if (!open || !scenario) return;
    let cancelled = false;
    setTitle(updating ? "" : scenario.name);
    setSummary(updating ? "" : scenario.description);
    setTags([]);
    setMetadataReady(!updating);
    setMetadataError(false);
    setThumbnailFile(null);
    setPolicies(null);
    setPoliciesError(false);
    setPoliciesAccepted(false);
    setSubmitting(false);

    if (updating) {
      const transport = catalog.authTransport;
      if (!transport) {
        setMetadataError(true);
      } else {
        void getScenarioPublishLink(scenario.id)
          .then(async (link) => {
            if (cancelled) return;
            if (!link) throw new Error("Published scenario link is missing");
            const published = await getOwnedCatalogScenario(
              transport,
              link.catalogScenarioId,
            );
            if (cancelled) return;
            setTitle(published.title);
            setSummary(published.summary);
            setTags(published.tags);
            setMetadataReady(true);
          })
          .catch(() => {
            if (!cancelled) setMetadataError(true);
          });
      }
    }

    if (!catalog.publicTransport) {
      setPoliciesError(true);
    } else {
      void fetchCurrentCatalogPolicies(catalog.publicTransport)
        .then((current) => {
          if (!cancelled) setPolicies(current);
        })
        .catch(() => {
          if (!cancelled) setPoliciesError(true);
        });
    }
    return () => {
      cancelled = true;
      formSession.current += 1;
    };
  }, [
    catalog.authTransport,
    catalog.publicTransport,
    loadAttempt,
    open,
    scenario,
    updating,
  ]);

  const canSubmit = Boolean(
    metadataReady &&
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
            if (!canSubmit || submitting) return;
            const session = formSession.current;
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
              if (session === formSession.current) onOpenChange(false);
            } finally {
              if (session === formSession.current) setSubmitting(false);
            }
          }}
        >
          {updating && !metadataReady ? (
            metadataError ? (
              <div role="alert" className="flex items-center gap-2 text-sm">
                <p className="text-destructive">
                  <Trans>Published scenario details could not be loaded.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                <Trans>Loading published scenario details...</Trans>
              </p>
            )
          ) : null}
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor={titleId}>
                <Trans>Title</Trans>
              </Label>
              <Input
                id={titleId}
                value={title}
                disabled={!metadataReady || submitting}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={summaryId}>
              <Trans>Summary</Trans>
            </Label>
            <Textarea
              id={summaryId}
              value={summary}
              maxLength={600}
              disabled={!metadataReady || submitting}
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
                placeholder={t`magic, city`}
                aria-label={t`Tags`}
                disabled={!metadataReady || submitting}
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
                disabled={!metadataReady || submitting}
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
