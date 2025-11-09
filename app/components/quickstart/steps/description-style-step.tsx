import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { countTokens } from "@/services/llm/tokenCounter";

interface DescriptionStyleStepProps {
  description: string;
  style: string;
  onDescriptionChange: (value: string) => void;
  onStyleChange: (value: string) => void;
}

export function DescriptionStyleStep({
  description,
  style,
  onDescriptionChange,
  onStyleChange,
}: DescriptionStyleStepProps) {
  const descriptionChars = description.length;
  const descriptionTokens = countTokens(description);
  const styleChars = style.length;
  const styleTokens = countTokens(style);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <p className="text-sm text-muted-foreground">
        These fields were generated based on your choices. You can modify them
        them here or from the Tale tab in the settings menue in-game.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Description Field */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <span className="text-xs text-muted-foreground">
                {descriptionChars} characters • ~{descriptionTokens} tokens
              </span>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="e.g., A mysterious adventure in a forgotten temple..."
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium">What is this?</p>
            <p>
              The description provides context about your scenario&apos;s
              setting, theme, and premise.
            </p>
            <p className="font-medium mt-3">Tips</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Describe the world and setting</li>
              <li>Mention the main theme or premise</li>
              <li>
                Leave characters, objects, and concepts to the story cards
              </li>
            </ul>
          </div>
        </div>

        {/* Narration Style Field */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="narration-style">
                Narration Style (Optional)
              </Label>
              <span className="text-xs text-muted-foreground">
                {styleChars} characters • ~{styleTokens} tokens
              </span>
            </div>
            <Textarea
              id="narration-style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              placeholder="e.g., Respond in the second person. Keep responses concise..."
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium">What is this?</p>
            <p>
              The narration style guides how the AI narrates and responds during
              gameplay.
            </p>
            <p className="font-medium mt-3">Tips</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Specify perspective (first/second person)</li>
              <li>Set tone and pacing preferences</li>
              <li>Include special narrative instructions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
