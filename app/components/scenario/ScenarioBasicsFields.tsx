import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bytesToObjectUrl } from "@/lib/utils";
import { useMemo } from "react";
import { Trans } from "@lingui/react/macro";

export type ScenarioBasicsFieldsProps = {
  name: string;
  thumbnail?: Uint8Array | null;
  description: string;
  onNameChange: (name: string) => void;
  onThumbnailChange: (bytes: Uint8Array | null) => void;
  onDescriptionChange: (text: string) => void;
};

export function ScenarioBasicsFields({
  name,
  thumbnail,
  description,
  onNameChange,
  onThumbnailChange,
  onDescriptionChange,
}: ScenarioBasicsFieldsProps) {
  const previewUrl = useMemo(
    () => bytesToObjectUrl(thumbnail ?? null),
    [thumbnail],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Name</Trans>
        </Label>
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Thumbnail (WebP recommended)</Trans>
        </Label>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="thumbnail preview"
            className="h-28 w-full object-cover rounded-xs border"
          />
        )}
        <Input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const arrayBuffer = await file.arrayBuffer();
            onThumbnailChange(new Uint8Array(arrayBuffer));
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Description</Trans>
        </Label>
        <p className="text-sm text-muted-foreground">
          <Trans>
            A short library-facing summary. It is not sent to the AI.
          </Trans>
        </p>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
    </div>
  );
}
