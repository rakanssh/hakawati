import { Trans, useLingui } from "@lingui/react/macro";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  usePrefersReducedMotion,
  useThemeScenery,
} from "@/hooks/useThemeScenery";
import { THEME_SCENERY_OPTIONS, type ThemeScenery } from "@/themes/registry";
import { Segmented } from "./settings-rows";

// Appearance controls shared by Settings and the story panel.

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
        <p className="w-full text-sm text-muted-foreground">
          <Trans>
            Your system asks for reduced motion, so scenery starts still.
          </Trans>
        </p>
      ) : null}
    </>
  );
}

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
