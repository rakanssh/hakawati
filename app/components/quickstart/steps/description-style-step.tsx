import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface DescriptionStyleStepProps {
  description: string;
  style: string;
  onDescriptionChange: (value: string) => void;
  onStyleChange: (value: string) => void;
}

const DESCRIPTION_MAX_LENGTH = 500;
const STYLE_MAX_LENGTH = 200;

export function DescriptionStyleStep({
  description,
  style,
  onDescriptionChange,
  onStyleChange,
}: DescriptionStyleStepProps) {
  const descriptionRemaining = DESCRIPTION_MAX_LENGTH - description.length;
  const styleRemaining = STYLE_MAX_LENGTH - style.length;
  const isDescriptionOverLimit = descriptionRemaining < 0;
  const isStyleOverLimit = styleRemaining < 0;

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
              <span
                className={`text-xs ${
                  isDescriptionOverLimit
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {descriptionRemaining} characters remaining
              </span>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="e.g., A mysterious adventure in a forgotten temple..."
              className="min-h-[120px] resize-none"
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
            {isDescriptionOverLimit && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <p>Description is too long. Please shorten it to continue.</p>
              </div>
            )}
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
              <span
                className={`text-xs ${
                  isStyleOverLimit
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {styleRemaining} characters remaining
              </span>
            </div>
            <Textarea
              id="narration-style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              placeholder="e.g., Respond in the second person. Keep responses concise..."
              className="min-h-[120px] resize-none"
              maxLength={STYLE_MAX_LENGTH}
            />
            {isStyleOverLimit && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <p>
                  Narration style is too long. Please shorten it to continue.
                </p>
              </div>
            )}
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
