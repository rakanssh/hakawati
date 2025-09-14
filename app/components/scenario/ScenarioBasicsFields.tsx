import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bytesToObjectUrl } from "@/lib/utils";
import { useMemo } from "react";
import { HelpTooltip } from "../ui/help-tooltip";

export type ScenarioBasicsFieldsProps = {
  name: string;
  thumbnail?: Uint8Array | null;
  initialDescription: string;
  initialAuthorNote: string;
  openingText: string;
  onNameChange: (name: string) => void;
  onThumbnailChange: (bytes: Uint8Array | null) => void;
  onInitialDescriptionChange: (text: string) => void;
  onInitialAuthorNoteChange: (text: string) => void;
  onOpeningTextChange: (text: string) => void;
};

export function ScenarioBasicsFields({
  name,
  thumbnail,
  initialDescription,
  initialAuthorNote,
  openingText,
  onNameChange,
  onThumbnailChange,
  onInitialDescriptionChange,
  onInitialAuthorNoteChange,
  onOpeningTextChange,
}: ScenarioBasicsFieldsProps) {
  const previewUrl = useMemo(
    () => bytesToObjectUrl(thumbnail ?? null),
    [thumbnail],
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <Label>Opening Text</Label>
          <HelpTooltip>
            <span>
              This is the initial paragraph of story that the player will
              respond to. <br /> Useful for setting up the initial scene.
            </span>
          </HelpTooltip>
        </div>
        <Textarea
          value={openingText}
          onChange={(e) => onOpeningTextChange(e.target.value)}
          className="rounded-xs"
        />
      </div>
    </div>
  );
}
