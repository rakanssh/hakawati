import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

export default function SettingsGame() {
  const { t } = useLingui();
  const { theme, setTheme } = useTheme();
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
    <div className="flex flex-col gap-4 max-w-full">
      <Label>
        <Trans>Appearance</Trans>
      </Label>

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Theme</Trans>
        </Label>
        <Select
          value={theme}
          onValueChange={(value) =>
            setTheme(value as "light" | "dark" | "system")
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t`Select a theme`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <Trans>System</Trans>
            </SelectItem>
            <SelectItem value="light">
              <Trans>Light</Trans>
            </SelectItem>
            <SelectItem value="dark">
              <Trans>Dark</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>
            <Trans>Language</Trans>
          </Label>
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
        </div>
        <div className="flex flex-col gap-2">
          <Label>
            <Trans>UI Direction</Trans>
          </Label>
          <Select
            value={textDirection}
            onValueChange={(value) => setTextDirection(value as TextDirection)}
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
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>UI Scale (0.8 - 1.5)</Trans>
        </Label>
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
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Font Size (0.75 - 2.0)</Trans>
        </Label>
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
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Font Family</Trans>
        </Label>
        <FontSelector />
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Game Log</Trans>
        </Label>
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
        <p className="text-sm text-muted-foreground">
          <Trans>
            Control thinking sections in the main game log: show all, only the
            latest, or hide them.
          </Trans>
        </p>
      </div>
    </div>
  );
}
