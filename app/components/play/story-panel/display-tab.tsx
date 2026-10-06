import { Trans } from "@lingui/react/macro";
import { ThemePicker } from "@/components/layout/settings/theme-picker";
import {
  FontFamilyField,
  HighlightLatestField,
  SceneryField,
  StoryTextSizeField,
} from "@/components/layout/settings/appearance-fields";
import {
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";

/** Theme and reading settings, so the look of a tale can be tuned without leaving it. */
export function DisplayTab() {
  return (
    <SettingsStack>
      <SettingsPanel title={<Trans>Theme</Trans>}>
        <ThemePicker />
        <SceneryField />
      </SettingsPanel>
      <SettingsPanel title={<Trans>Reading</Trans>}>
        <StoryTextSizeField />
        <FontFamilyField />
        <HighlightLatestField />
      </SettingsPanel>
    </SettingsStack>
  );
}
