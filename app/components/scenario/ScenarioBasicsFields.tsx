import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { detectCoverImageContentType } from "@/lib/cover-image";
import { bytesToObjectUrl } from "@/lib/utils";
import { useEffect, useId, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";

export type ScenarioBasicsFieldsProps = {
  name: string;
  thumbnail?: Uint8Array | null;
  description: string;
  onNameChange: (name: string) => void;
  onThumbnailChange: (bytes: Uint8Array | null) => void;
  onDescriptionChange: (text: string) => void;
  onCoverReadingChange?: (reading: boolean) => void;
  disabled?: boolean;
};

export function ScenarioBasicsFields({
  name,
  thumbnail,
  description,
  onNameChange,
  onThumbnailChange,
  onDescriptionChange,
  onCoverReadingChange,
  disabled = false,
}: ScenarioBasicsFieldsProps) {
  const { t } = useLingui();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const readRequest = useRef(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [coverError, setCoverError] = useState("");
  const [readingCover, setReadingCover] = useState(false);
  const nameTooLong = name.trim().length > 160;
  const descriptionTooLong = description.trim().length > 600;

  useEffect(() => {
    const url = bytesToObjectUrl(
      thumbnail,
      thumbnail ? (detectCoverImageContentType(thumbnail) ?? "") : "",
    );
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumbnail]);

  useEffect(
    () => () => {
      readRequest.current += 1;
    },
    [],
  );

  useEffect(() => {
    onCoverReadingChange?.(readingCover);
    return () => onCoverReadingChange?.(false);
  }, [onCoverReadingChange, readingCover]);

  async function selectCover(file: File) {
    const request = ++readRequest.current;
    setCoverError("");
    setReadingCover(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== readRequest.current) return;
      if (!detectCoverImageContentType(bytes)) {
        setCoverError(t`Choose a JPEG, PNG, or WebP image.`);
        return;
      }
      onThumbnailChange(bytes);
    } catch {
      if (request === readRequest.current) {
        setCoverError(
          t`The cover image could not be read. Please choose it again.`,
        );
      }
    } finally {
      if (request === readRequest.current) setReadingCover(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${id}-cover`}>
          <Trans>Cover image</Trans>
        </Label>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t`Scenario cover preview`}
            className="aspect-[3/2] w-full rounded-xs border object-cover"
          />
        ) : (
          <div className="flex aspect-[3/2] items-center justify-center rounded-xs border border-dashed text-sm text-muted-foreground">
            <Trans>No cover</Trans>
          </div>
        )}
        <Input
          ref={fileInput}
          id={`${id}-cover`}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || readingCover}
          aria-describedby={coverError ? `${id}-cover-error` : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void selectCover(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || readingCover}
          onClick={() => fileInput.current?.click()}
        >
          {readingCover ? (
            <Trans>Reading cover…</Trans>
          ) : previewUrl ? (
            <Trans>Replace cover</Trans>
          ) : (
            <Trans>Add cover</Trans>
          )}
        </Button>
        {thumbnail && thumbnail.byteLength > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || readingCover}
            onClick={() => {
              setCoverError("");
              onThumbnailChange(null);
            }}
          >
            <Trans>Remove cover</Trans>
          </Button>
        )}
        {coverError && (
          <p
            id={`${id}-cover-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {coverError}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>
            <Trans>Name</Trans>
          </Label>
          <Input
            id={`${id}-name`}
            value={name}
            disabled={disabled}
            aria-describedby={nameTooLong ? `${id}-name-hint` : undefined}
            onChange={(e) => onNameChange(e.target.value)}
          />
          {nameTooLong && (
            <p id={`${id}-name-hint`} className="text-sm text-destructive">
              <Trans>
                Shorten the name to 160 characters before publishing. You can
                still save this draft.
              </Trans>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-description`}>
            <Trans>Description</Trans>
          </Label>
          <p
            id={`${id}-description-hint`}
            className="text-sm text-muted-foreground"
          >
            <Trans>
              Shown in your library and the public catalog. It is not sent to
              the AI.
            </Trans>
          </p>
          <Textarea
            id={`${id}-description`}
            value={description}
            disabled={disabled}
            aria-describedby={`${id}-description-hint ${id}-description-count${descriptionTooLong ? ` ${id}-description-limit` : ""}`}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
          <p
            id={`${id}-description-count`}
            className="text-xs text-muted-foreground"
          >
            <Trans>
              {description.trim().length}/600 characters for publishing
            </Trans>
          </p>
          {descriptionTooLong && (
            <p
              id={`${id}-description-limit`}
              className="text-sm text-destructive"
            >
              <Trans>
                Shorten the description to 600 characters before publishing. You
                can still save this draft.
              </Trans>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
