import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettingsStore,
  type TextDirection,
  type ThinkingVisibility,
} from "@/store/useSettingsStore";
import { useTheme } from "@/components/theme-provider";
import { FontSelector } from "./font-selector";
import { type Locale, LOCALES, loadLocale } from "@/i18n";
import type { ThemeId } from "@/lib/themes";
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";

export default function SettingsGame() {
  const { t } = useLingui();
  const { theme, themes, setTheme } = useTheme();
  const {
    uiScale,
    setUiScale,
    fontSize,
    setFontSize,
    textDirection,
    setTextDirection,
    language,
    setLanguage,
    thinkingVisibility,
    setThinkingVisibility,
  } = useSettingsStore();

  const handleLanguageChange = (value: string) => {
    const locale = value as Locale;
    setLanguage(locale);
    void loadLocale(locale);
  };

  return (
    <SettingsStack>
      <SettingsPanel
        title={<Trans>Look and language</Trans>}
        description={
          <Trans>Set the visual style, language, and reading direction.</Trans>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label={<Trans>Theme</Trans>}>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as ThemeId)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t`Select a theme`} />
              </SelectTrigger>
              <SelectContent>
                {themes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>

          <SettingsField label={<Trans>Language</Trans>}>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t`Select language`} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOCALES).map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField label={<Trans>UI Direction</Trans>}>
            <Select
              value={textDirection}
              onValueChange={(value) =>
                setTextDirection(value as TextDirection)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t`Select direction`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">
                  <Trans>Language Default</Trans>
                </SelectItem>
                <SelectItem value="ltr">
                  <Trans>Left to Right</Trans>
                </SelectItem>
                <SelectItem value="rtl">
                  <Trans>Right to Left</Trans>
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title={<Trans>Reading comfort</Trans>}
        description={
          <Trans>
            Adjust interface density, story text size, and font choice.
          </Trans>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label={<Trans>UI Scale (0.8 - 1.5)</Trans>}>
            <div className="flex flex-row items-center gap-2">
              <NumberInput
                min={0.8}
                max={1.5}
                step={0.05}
                value={uiScale}
                onValueCommit={(value) => setUiScale(value)}
                aria-label={t`User interface scale`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUiScale(1)}
                disabled={Math.abs(uiScale - 1) < 0.01}
              >
                <Trans>Reset</Trans>
              </Button>
            </div>
          </SettingsField>

          <SettingsField label={<Trans>Font Size (0.75 - 2.0)</Trans>}>
            <div className="flex flex-row items-center gap-2">
              <NumberInput
                min={0.75}
                max={2}
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

          <SettingsField
            label={<Trans>Font Family</Trans>}
            className="sm:col-span-2"
          >
            <FontSelector />
          </SettingsField>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title={<Trans>AI thinking</Trans>}
        description={
          <Trans>Choose how much model reasoning appears in the log.</Trans>
        }
      >
        <SettingsField label={<Trans>Thinking Visibility</Trans>}>
          <Select
            value={thinkingVisibility}
            onValueChange={(value) =>
              setThinkingVisibility(value as ThinkingVisibility)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t`Select thinking visibility`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <Trans>All</Trans>
              </SelectItem>
              <SelectItem value="latest">
                <Trans>Latest</Trans>
              </SelectItem>
              <SelectItem value="none">
                <Trans>None</Trans>
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsPanel>
    </SettingsStack>
  );
}
