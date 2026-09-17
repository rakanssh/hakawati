import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Scenario } from "@/types/context.type";
import { Trans, useLingui } from "@lingui/react/macro";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import {
  fetchCurrentCatalogPolicies,
  prepareScenarioPublishDraft,
  publishingAcceptanceFor,
  type CatalogCurrentPolicies,
  type CatalogPublishingAcceptance,
} from "@/services/catalog.service";
import { bytesToObjectUrl } from "@/lib/utils";
import { detectCoverImageContentType } from "@/lib/cover-image";
import { openUrl } from "@tauri-apps/plugin-opener";
import { analyzeScenarioQuestions } from "@/lib/scenario-questions";
import { ScenarioQuestionErrors } from "./ScenarioQuestionsHelp";

type PublishScenarioDialogProps = {
  open: boolean;
  scenario: Scenario | null;
  updating: boolean;
  thumbnailUploads: boolean;
  catalog: CatalogClientState;
  onOpenChange: (open: boolean) => void;
  onEdit: (scenario: Scenario) => void;
  onPublish: (input: {
    scenario: Scenario;
    tags: string[];
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
  onEdit,
  onPublish,
}: PublishScenarioDialogProps) {
  const { t } = useLingui();
  const acceptanceId = useId();
  const formSession = useRef(0);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<CatalogCurrentPolicies | null>(null);
  const [policiesError, setPoliciesError] = useState(false);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metadataReady, setMetadataReady] = useState(false);
  const [metadataError, setMetadataError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const questionDiagnostics = useMemo(
    () => analyzeScenarioQuestions(draft?.content ?? []).diagnostics,
    [draft?.content],
  );

  useEffect(() => {
    formSession.current += 1;
    if (!open || !scenario) return;
    let cancelled = false;
    const snapshot = structuredClone(scenario);
    setDraft(snapshot);
    setTags([]);
    setMetadataReady(!updating);
    setMetadataError(false);
    setPublishError(null);
    setPolicies(null);
    setPoliciesError(false);
    setPoliciesAccepted(false);
    setSubmitting(false);

    if (updating) {
      const transport = catalog.authTransport;
      if (!transport) {
        setMetadataError(true);
      } else {
        void prepareScenarioPublishDraft(snapshot, transport)
          .then(({ scenario: prepared, published }) => {
            if (cancelled) return;
            if (!published)
              throw new Error("Published scenario link is missing");
            setDraft(prepared);
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

  useEffect(() => {
    const bytes = open ? draft?.thumbnail : null;
    const url = bytes
      ? bytesToObjectUrl(bytes, detectCoverImageContentType(bytes))
      : "";
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft?.thumbnail, open]);

  const detailsError = !draft?.name.trim()
    ? t`Add a scenario name before publishing.`
    : draft.name.trim().length > 160
      ? t`Shorten the scenario name to 160 characters before publishing.`
      : !draft.description.trim()
        ? t`Add a description before publishing.`
        : draft.description.trim().length > 600
          ? t`Shorten the description to 600 characters before publishing.`
          : draft.thumbnail?.length && !thumbnailUploads
            ? t`Cover uploads are currently unavailable. Your draft is saved; try publishing again later.`
            : null;

  const canSubmit = Boolean(
    !questionDiagnostics.length &&
      metadataReady &&
      draft &&
      !detailsError &&
      tags.length > 0 &&
      policies &&
      policiesAccepted,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!submitting}
      >
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
              Publish the name, description, cover, and story content from this
              draft together. Later edits stay private until you publish again.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {draft && <ScenarioQuestionErrors content={draft.content} />}
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSubmit || submitting) return;
            const session = formSession.current;
            const policyAcceptance = publishingAcceptanceFor(policies!);
            setSubmitting(true);
            setPublishError(null);
            try {
              await onPublish({
                scenario: structuredClone(draft!),
                tags: [...tags],
                policyAcceptance,
              });
              if (session === formSession.current) onOpenChange(false);
            } catch (error) {
              if (session === formSession.current)
                setPublishError(
                  error instanceof Error
                    ? error.message
                    : t`Failed to publish scenario`,
                );
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
          {draft && (
            <section className="overflow-hidden rounded-xs border bg-muted/20">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={t`Scenario cover`}
                  className="max-h-48 w-full object-contain bg-muted/40"
                />
              ) : (
                <p className="border-b p-3 text-sm text-muted-foreground">
                  <Trans>No cover image</Trans>
                </p>
              )}
              <div className="grid gap-2 p-4">
                <h3 className="break-words text-lg font-semibold">
                  {draft.name}
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {draft.description}
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto justify-self-start p-0"
                  disabled={submitting || (!metadataReady && !metadataError)}
                  onClick={() => onEdit(structuredClone(draft))}
                >
                  <Trans>Edit scenario</Trans>
                </Button>
              </div>
            </section>
          )}
          {detailsError && (
            <p role="alert" className="text-sm text-destructive">
              {detailsError}
            </p>
          )}
          {publishError && (
            <p role="alert" className="text-sm text-destructive">
              {publishError}
            </p>
          )}
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
          <div className="grid gap-2 rounded-xs border p-3 text-sm">
            {policiesError ? (
              <p className="text-destructive">
                <Trans>Publishing policies could not be loaded.</Trans>
              </p>
            ) : policies ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id={acceptanceId}
                  disabled={submitting}
                  checked={policiesAccepted}
                  onCheckedChange={(checked) =>
                    setPoliciesAccepted(checked === true)
                  }
                />
                <div className="grid gap-1 leading-relaxed">
                  <Label htmlFor={acceptanceId}>
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
              disabled={submitting}
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
