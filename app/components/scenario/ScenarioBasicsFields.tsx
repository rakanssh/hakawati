import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bytesToObjectUrl } from "@/lib/utils";
import { useMemo } from "react";

export type ScenarioBasicsFieldsProps = {
  name: string;
  thumbnailWebp?: Uint8Array | null;
  initialDescription: string;
  initialAuthorNote: string;
  onNameChange: (name: string) => void;
  onThumbnailChange: (bytes: Uint8Array | null) => void;
  onInitialDescriptionChange: (text: string) => void;
  onInitialAuthorNoteChange: (text: string) => void;
};

export function ScenarioBasicsFields({
  name,
  thumbnailWebp,
  initialDescription,
  initialAuthorNote,
  onNameChange,
  onThumbnailChange,
  onInitialDescriptionChange,
  onInitialAuthorNoteChange,
}: ScenarioBasicsFieldsProps) {
  const previewUrl = useMemo(
    () => bytesToObjectUrl(thumbnailWebp ?? null),
    [thumbnailWebp],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="rounded-xs"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Thumbnail (WebP recommended)</Label>
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
          className="rounded-xs"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Initial Description</Label>
        <Textarea
          value={initialDescription}
          onChange={(e) => onInitialDescriptionChange(e.target.value)}
          className="rounded-xs"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Initial Author Notes</Label>
        <Textarea
          value={initialAuthorNote}
          onChange={(e) => onInitialAuthorNoteChange(e.target.value)}
          className="rounded-xs"
        />
      </div>
    </div>
  );
}
