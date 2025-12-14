import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { countTokens } from "@/services/llm/tokenCounter";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const descriptionChars = description.length;
  const descriptionTokens = countTokens(description);
  const styleChars = style.length;
  const styleTokens = countTokens(style);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <p className="text-sm text-muted-foreground">
        <Trans>
          These fields were generated based on your choices. You can modify them
          here or from the Tale tab in the settings menu in-game.
        </Trans>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Description Field */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">
                <Trans>Description</Trans>
              </Label>
              <span className="text-xs text-muted-foreground">
                {t`${descriptionChars} characters • ~${descriptionTokens} tokens`}
              </span>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t`e.g., A mysterious adventure in a forgotten temple...`}
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium">
              <Trans>What is this?</Trans>
            </p>
            <p>
              <Trans>
                The description provides context about your scenario&apos;s
                setting, theme, and premise.
              </Trans>
            </p>
            <p className="font-medium mt-3">
              <Trans>Tips</Trans>
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>
                <Trans>Describe the world and setting</Trans>
              </li>
              <li>
                <Trans>Mention the main theme or premise</Trans>
              </li>
              <li>
                <Trans>
                  Leave characters, objects, and concepts to the story cards
                </Trans>
              </li>
            </ul>
          </div>
        </div>

        {/* Narration Style Field */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="narration-style">
                <Trans>Narration Style (Optional)</Trans>
              </Label>
              <span className="text-xs text-muted-foreground">
                {t`${styleChars} characters • ~${styleTokens} tokens`}
              </span>
            </div>
            <Textarea
              id="narration-style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              placeholder={t`e.g., Respond in the second person. Keep responses concise...`}
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium">
              <Trans>What is this?</Trans>
            </p>
            <p>
              <Trans>
                The narration style guides how the AI narrates and responds
                during gameplay.
              </Trans>
            </p>
            <p className="font-medium mt-3">
              <Trans>Tips</Trans>
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>
                <Trans>Specify perspective (first/second person)</Trans>
              </li>
              <li>
                <Trans>Set tone and pacing preferences</Trans>
              </li>
              <li>
                <Trans>Include special narrative instructions</Trans>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
