import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTaleStore } from "@/store/useTaleStore";
import { countTokens } from "@/services/llm/tokenCounter";

export default function SettingsTale() {
  const { description, authorNote, setDescription, setAuthorNote } =
    useTaleStore();

  const descriptionChars = description.length;
  const descriptionTokens = countTokens(description);
  const authorNoteChars = authorNote.length;
  const authorNoteTokens = countTokens(authorNote);

  return (
    <div className="flex flex-col gap-4 max-w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Description</Label>
          <span className="text-xs text-muted-foreground">
            {descriptionChars} characters • ~{descriptionTokens} tokens
          </span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Author Notes</Label>
          <span className="text-xs text-muted-foreground">
            {authorNoteChars} characters • ~{authorNoteTokens} tokens
          </span>
        </div>
        <Textarea
          value={authorNote}
          onChange={(e) => setAuthorNote(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );
}
