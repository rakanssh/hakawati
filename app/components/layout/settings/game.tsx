import { Trans, useLingui } from "@lingui/react/macro";
import {
  useSettingsStore,
  type TextDirection,
  type ThinkingVisibility,
} from "@/store/useSettingsStore";
import { type Locale, LOCALES, loadLocale } from "@/i18n";
import { useTheme } from "@/components/theme-provider";
import { fontPresets } from "@/data/font-presets";
import { THEME_FONT, themes, type ThemePreference } from "@/themes/registry";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "@/lib/appearance-limits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemePicker } from "./theme-picker";
import { ThemePreview } from "./theme-preview";
import { SceneryOptions, SizeStepper } from "./appearance-fields";
import { FontSelector } from "./font-selector";
import { useSettingsNavigation, useSettingsWindow } from "./settings-shell";
import {
  BlockRow,
  LinkRow,
  PlainRow,
  RadioRow,
  RowText,
  Segmented,
  SetupList,
  SetupSection,
  ToggleSwitch,
} from "./settings-rows";

function ThemeSwatch({ preference }: { preference: ThemePreference }) {
  if (preference === "system") {
    return (
      <div className="relative w-14 shrink-0 overflow-hidden rounded-xs border">
        <ThemePreview id="light" />
        <ThemePreview
          id="dark"
          className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      </div>
    );
  }
  return (
    <ThemePreview id={preference} className="w-14 shrink-0 rounded-xs border" />
  );
}

function useFontName() {
  const { t } = useLingui();
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const font =
    fontPresets.find((preset) => preset.value === fontFamily) ?? fontPresets[0];
  return font.value === THEME_FONT ? t`Theme font` : font.name;
}

function pickLanguage(code: Locale) {
  useSettingsStore.getState().setLanguage(code);
  void loadLocale(code);
}

function LanguageSelect() {
  const { t } = useLingui();
  const language = useSettingsStore((state) => state.language);
  return (
    <Select
      value={language}
      onValueChange={(code) => pickLanguage(code as Locale)}
    >
      <SelectTrigger className="w-56" aria-label={t`Language`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(LOCALES) as [Locale, string][]).map(([code, name]) => (
          <SelectItem key={code} value={code} lang={code}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Overview() {
  const { t } = useLingui();
  const navigation = useSettingsNavigation();
  // The desktop window picks a font or language from a dropdown; phones open a page.
  const windowed = useSettingsWindow();
  const { preference } = useTheme();
  const theme = themes.find((item) => item.id === preference);
  const themeName = theme ? t(theme.name) : t`System`;
  const fontName = useFontName();
  const {
    uiScale,
    setUiScale,
    fontSize,
    setFontSize,
    highlightLatestSection,
    setHighlightLatestSection,
    thinkingVisibility,
    setThinkingVisibility,
    language,
    textDirection,
    setTextDirection,
  } = useSettingsStore();

  return (
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Theme</Trans>}>
        <SetupList>
          <LinkRow
            title={windowed ? <Trans>Theme</Trans> : themeName}
            trailing={
              <>
                {windowed && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {themeName}
                  </span>
                )}
                <ThemeSwatch preference={preference} />
              </>
            }
            onClick={() => navigation.push("theme")}
          />
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
          <PlainRow>
            <RowText title={<Trans>Interface size</Trans>} />
            <SizeStepper
              value={uiScale}
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              label={t`Interface size`}
              onChange={setUiScale}
            />
          </PlainRow>
          {windowed ? (
            <PlainRow>
              <RowText title={<Trans>Font</Trans>} />
              <div className="w-56 shrink-0">
                <FontSelector />
              </div>
            </PlainRow>
          ) : (
            <LinkRow
              title={<Trans>Font</Trans>}
              trailing={
                <span className="shrink-0 text-sm text-muted-foreground">
                  {fontName}
                </span>
              }
              onClick={() => navigation.push("font")}
            />
          )}
          <PlainRow>
            <RowText title={<Trans>Highlight the latest passage</Trans>} />
            <ToggleSwitch
              checked={highlightLatestSection}
              onCheckedChange={setHighlightLatestSection}
              label={t`Highlight the latest passage`}
            />
          </PlainRow>
          <BlockRow title={<Trans>Show AI thinking</Trans>}>
            <Segmented<ThinkingVisibility>
              fill
              label={t`Show AI thinking`}
              value={thinkingVisibility}
              options={[
                { value: "all", label: <Trans>All</Trans> },
                { value: "latest", label: <Trans>Latest</Trans> },
                { value: "none", label: <Trans>None</Trans> },
              ]}
              onChange={setThinkingVisibility}
            />
          </BlockRow>
        </SetupList>
      </SetupSection>

      <SetupSection title={<Trans>Language</Trans>}>
        <SetupList>
          {windowed ? (
            <PlainRow>
              <RowText title={<Trans>Language</Trans>} />
              <LanguageSelect />
            </PlainRow>
          ) : (
            <LinkRow
              title={<Trans>Language</Trans>}
              trailing={
                <span className="shrink-0 text-sm text-muted-foreground">
                  {LOCALES[language]}
                </span>
              }
              onClick={() => navigation.push("language")}
            />
          )}
          <BlockRow title={<Trans>Direction</Trans>}>
            <Segmented<TextDirection>
              fill
              label={t`Direction`}
              value={textDirection}
              options={[
                { value: "system", label: <Trans>Auto</Trans> },
                { value: "ltr", label: <Trans>Left to right</Trans> },
                { value: "rtl", label: <Trans>Right to left</Trans> },
              ]}
              onChange={setTextDirection}
            />
          </BlockRow>
        </SetupList>
      </SetupSection>
    </div>
  );
}

function FontPage() {
  const { t } = useLingui();
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const setFontFamily = useSettingsStore((state) => state.setFontFamily);
  return (
    <SetupList role="radiogroup" aria-label={t`Font`}>
      {fontPresets.map((font) => {
        const themeFont = font.value === THEME_FONT;
        return (
          <RadioRow
            key={font.id}
            checked={fontFamily === font.value}
            onClick={() => setFontFamily(font.value)}
            title={
              <span style={themeFont ? undefined : { fontFamily: font.value }}>
                {themeFont ? t`Theme font` : font.name}
              </span>
            }
            detail={
              themeFont ? (
                <Trans>The type each theme was designed with</Trans>
              ) : font.preview ? (
                <span style={{ fontFamily: font.value }}>{font.preview}</span>
              ) : undefined
            }
          />
        );
      })}
    </SetupList>
  );
}

function LanguagePage() {
  const { t } = useLingui();
  const language = useSettingsStore((state) => state.language);
  return (
    <SetupList role="radiogroup" aria-label={t`Language`}>
      {(Object.entries(LOCALES) as [Locale, string][]).map(([code, name]) => (
        <RadioRow
          key={code}
          checked={language === code}
          lang={code}
          onClick={() => pickLanguage(code)}
          title={name}
        />
      ))}
    </SetupList>
  );
}

/** Heads Appearance's pages in the settings header. */
export function AppearanceTitle({ page }: { page: string }) {
  switch (page) {
    case "theme":
      return <Trans>Theme</Trans>;
    case "font":
      return <Trans>Font</Trans>;
    case "language":
      return <Trans>Language</Trans>;
    default:
      return <Trans>Appearance</Trans>;
  }
}

export default function SettingsGame() {
  const navigation = useSettingsNavigation();
  switch (navigation.page) {
    case "theme":
      return <ThemePicker />;
    case "font":
      return <FontPage />;
    case "language":
      return <LanguagePage />;
    default:
      return <Overview />;
  }
}
