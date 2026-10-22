import { Trans, useLingui } from "@lingui/react/macro";
import { ThemePicker } from "@/components/layout/settings/theme-picker";
import { FontSelector } from "@/components/layout/settings/font-selector";
import {
  SceneryOptions,
  SizeStepper,
} from "@/components/layout/settings/appearance-fields";
import {
  BlockRow,
  PlainRow,
  RowText,
  SetupList,
  SetupSection,
  ToggleSwitch,
} from "@/components/layout/settings/settings-rows";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/appearance-limits";
import { useSettingsStore } from "@/store/useSettingsStore";

/** Theme and reading settings, so the look of a tale can be tuned without leaving it. */
export function DisplayTab() {
  const { t } = useLingui();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const setFontSize = useSettingsStore((state) => state.setFontSize);
  const highlightLatestSection = useSettingsStore(
    (state) => state.highlightLatestSection,
  );
  const setHighlightLatestSection = useSettingsStore(
    (state) => state.setHighlightLatestSection,
  );

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Theme</Trans>}>
        <ThemePicker />
        <SetupList>
          <BlockRow title={<Trans>Scenery</Trans>}>
            <SceneryOptions />
          </BlockRow>
        </SetupList>
      </SetupSection>

      <SetupSection title={<Trans>Reading</Trans>}>
        <SetupList>
          <PlainRow>
            <RowText title={<Trans>Text size</Trans>} />
            <SizeStepper
              value={fontSize}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              label={t`Text size`}
              onChange={setFontSize}
            />
          </PlainRow>
          <BlockRow title={<Trans>Font</Trans>}>
            <FontSelector />
          </BlockRow>
          <PlainRow>
            <RowText title={<Trans>Highlight the latest passage</Trans>} />
            <ToggleSwitch
              checked={highlightLatestSection}
              onCheckedChange={setHighlightLatestSection}
              label={t`Highlight the latest passage`}
            />
          </PlainRow>
        </SetupList>
      </SetupSection>
    </div>
  );
}
