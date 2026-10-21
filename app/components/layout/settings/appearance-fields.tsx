import { Trans, useLingui } from "@lingui/react/macro";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  usePrefersReducedMotion,
  useThemeScenery,
} from "@/hooks/useThemeScenery";
import { THEME_SCENERY_OPTIONS, type ThemeScenery } from "@/themes/registry";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/appearance-limits";
import { FontSelector } from "./font-selector";
import { SettingsField } from "./settings-layout";
import { Segmented } from "./settings-rows";

// Appearance controls shared by the Settings dialog and the story panel.

/** Animated, Still, or Off, with a note when the system asks for less motion. */
export function SceneryOptions() {
  const { t } = useLingui();
  const chosen = useSettingsStore((state) => state.themeScenery);
  const themeScenery = useThemeScenery();
  const reducedMotion = usePrefersReducedMotion();
  const setThemeScenery = useSettingsStore((state) => state.setThemeScenery);
  const labels: Record<ThemeScenery, string> = {
    animated: t`Animated`,
    still: t`Still`,
    off: t`Off`,
  };

  return (
    <>
      <Segmented<ThemeScenery>
        fill
        label={t`Scenery`}
        value={themeScenery}
        options={THEME_SCENERY_OPTIONS.map((option) => ({
          value: option,
          label: labels[option],
        }))}
        onChange={setThemeScenery}
      />
      {!chosen && reducedMotion ? (
        <p className="text-sm text-muted-foreground">
          <Trans>
            Your system asks for reduced motion, so scenery starts still.
          </Trans>
        </p>
      ) : null}
    </>
  );
}

export function SceneryField() {
  return (
    <SettingsField label={<Trans>Scenery</Trans>}>
      <SceneryOptions />
    </SettingsField>
  );
}

/** A percentage nudged up or down a step at a time. */
export function SizeStepper({
  value,
  min,
  max,
  step = 0.1,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const { t } = useLingui();
  const percent = Math.round(value * 100);
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1.5"
    >
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label={t`Smaller`}
        disabled={value <= min + 0.001}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <MinusIcon className="size-4" />
      </Button>
      <span className="min-w-14 text-center text-sm tabular-nums">
        {percent}%
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label={t`Larger`}
        disabled={value >= max - 0.001}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
}

export function StoryTextSizeField() {
  const { t } = useLingui();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const setFontSize = useSettingsStore((state) => state.setFontSize);

  return (
    <SettingsField label={<Trans>Text size</Trans>}>
      <SizeStepper
        value={fontSize}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        label={t`Text size`}
        onChange={setFontSize}
      />
    </SettingsField>
  );
}

export function FontFamilyField({ className }: { className?: string }) {
  return (
    <SettingsField label={<Trans>Font</Trans>} className={className}>
      <FontSelector />
    </SettingsField>
  );
}

export function HighlightLatestField() {
  const highlightLatestSection = useSettingsStore(
    (state) => state.highlightLatestSection,
  );
  const setHighlightLatestSection = useSettingsStore(
    (state) => state.setHighlightLatestSection,
  );

  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={highlightLatestSection}
        onCheckedChange={(checked) =>
          setHighlightLatestSection(checked === true)
        }
      />
      <Trans>Highlight the latest passage</Trans>
    </label>
  );
}
