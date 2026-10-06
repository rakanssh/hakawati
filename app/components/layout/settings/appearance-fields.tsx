import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore } from "@/store/useSettingsStore";
import { THEME_SCENERY_OPTIONS, type ThemeScenery } from "@/themes/registry";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/appearance-limits";
import { cn } from "@/lib/utils";
import { FontSelector } from "./font-selector";
import { SettingsField } from "./settings-layout";

// Appearance controls shared by the Settings dialog and the story panel.

export function SceneryField() {
  const { t } = useLingui();
  const themeScenery = useSettingsStore((state) => state.themeScenery);
  const setThemeScenery = useSettingsStore((state) => state.setThemeScenery);
  const labels: Record<ThemeScenery, string> = {
    animated: t`Animated`,
    still: t`Still`,
    off: t`Off`,
  };

  return (
    <SettingsField
      label={<Trans>Scenery</Trans>}
      description={
        <Trans>
          Drawn around the story on the play screen. Still keeps it without
          movement; Off keeps only the colours and type.
        </Trans>
      }
    >
      <div
        role="radiogroup"
        aria-label={t`Scenery`}
        className="inline-flex w-fit rounded-xs border bg-muted/40 p-0.5"
      >
        {THEME_SCENERY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={themeScenery === option}
            onClick={() => setThemeScenery(option)}
            className={cn(
              "rounded-[calc(var(--radius)-6px)] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              themeScenery === option &&
                "bg-background text-foreground shadow-sm",
            )}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </SettingsField>
  );
}

export function StoryTextSizeField() {
  const { t } = useLingui();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const setFontSize = useSettingsStore((state) => state.setFontSize);

  return (
    <SettingsField label={<Trans>Font Size (0.5 - 4.0)</Trans>}>
      <div className="flex flex-row items-center gap-2">
        <NumberInput
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={0.05}
          value={fontSize}
          onValueCommit={(value) => setFontSize(value)}
          aria-label={t`Game log font size`}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFontSize(1)}
          disabled={Math.abs(fontSize - 1) < 0.01}
        >
          <Trans>Reset</Trans>
        </Button>
      </div>
    </SettingsField>
  );
}

export function FontFamilyField({ className }: { className?: string }) {
  return (
    <SettingsField label={<Trans>Font Family</Trans>} className={className}>
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
    <SettingsField label={<Trans>Latest section</Trans>}>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={highlightLatestSection}
          onCheckedChange={(checked) =>
            setHighlightLatestSection(checked === true)
          }
        />
        <Trans>Highlight last section</Trans>
      </label>
    </SettingsField>
  );
}
