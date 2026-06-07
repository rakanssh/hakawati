import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trans, useLingui } from "@lingui/react/macro";

interface OptionalDetailsStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function OptionalDetailsStep({
  value,
  onChange,
}: OptionalDetailsStepProps) {
  const { t } = useLingui();

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <p className="text-sm text-muted-foreground text-center">
        <Trans>Add anything else the tale should know before it begins</Trans>
      </p>

      <div className="space-y-2">
        <Label htmlFor="quickstart-extra-details">
          <Trans>Extra Details (Optional)</Trans>
        </Label>
        <Textarea
          id="quickstart-extra-details"
          placeholder={t`e.g., Start during a festival, include a lost sibling, avoid grim endings...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[140px] resize-none"
        />
        <p className="text-xs text-muted-foreground">
          <Trans>
            Leave this blank to let the utility model fill in the gaps.
          </Trans>
        </p>
      </div>
    </div>
  );
}
