import { useEffect, type KeyboardEvent } from "react";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { loadThemeFonts } from "@/themes/fonts";
import { prepareThemeTextures } from "@/themes/textures";
import {
  themes,
  type ThemeDefinition,
  type ThemePreference,
} from "@/themes/registry";
import { ThemePreview } from "./theme-preview";

const OPTIONS: ThemePreference[] = [
  "system",
  ...themes.map((theme) => theme.id),
];

/** Arrow keys move between cards, as in any radio group. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
    event.key
  ];
  if (!step) return;
  const cards = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]"),
  ];
  const index = cards.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  const next =
    cards[
      (index + (rtl && horizontal ? -step : step) + cards.length) % cards.length
    ];
  next.focus();
  next.click();
}

function ThemeCard({
  selected,
  name,
  description,
  mode,
  nameFont,
  nameScale = 1,
  preview,
  onSelect,
}: {
  selected: boolean;
  name: string;
  description: string;
  mode: ThemeDefinition["mode"] | "system";
  nameFont?: string;
  nameScale?: number;
  preview: React.ReactNode;
  onSelect: () => void;
}) {
  const ModeIcon =
    mode === "system" ? MonitorIcon : mode === "dark" ? MoonIcon : SunIcon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      tabIndex={selected ? 0 : -1}
      title={description}
      onClick={onSelect}
      className={cn(
        "group flex flex-col overflow-hidden rounded-sm border bg-card text-start transition-[border-color,box-shadow,transform] outline-none",
        "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <div className="relative">
        {preview}
        {selected && (
          <span className="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <CheckIcon className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="flex items-center justify-between gap-2 border-t px-2.5 py-2">
        <span
          className="truncate text-sm font-medium"
          style={
            nameFont
              ? { fontFamily: nameFont, fontSize: `${nameScale * 0.875}rem` }
              : undefined
          }
        >
          {name}
        </span>
        <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </span>
    </button>
  );
}

/** Theme choices as a grid of live miniatures of the play screen. */
export function ThemePicker() {
  const { t } = useLingui();
  const { preference, setPreference } = useTheme();

  useEffect(() => {
    for (const theme of themes) {
      loadThemeFonts(theme);
      prepareThemeTextures(theme.id);
    }
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label={t`Theme`}
      onKeyDown={moveFocus}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {OPTIONS.map((option) => {
        if (option === "system") {
          return (
            <ThemeCard
              key="system"
              selected={preference === "system"}
              name={t`System`}
              description={t`Light or Dark, following your device.`}
              mode="system"
              preview={
                <div className="relative">
                  <ThemePreview id="light" />
                  <ThemePreview
                    id="dark"
                    className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
                  />
                </div>
              }
              onSelect={() => setPreference("system")}
            />
          );
        }
        const theme = themes.find((item) => item.id === option)!;
        return (
          <ThemeCard
            key={theme.id}
            selected={preference === theme.id}
            name={t(theme.name)}
            description={t(theme.description)}
            mode={theme.mode}
            nameFont={theme.nameFont}
            nameScale={theme.nameScale}
            preview={<ThemePreview id={theme.id} />}
            onSelect={() => setPreference(theme.id)}
          />
        );
      })}
    </div>
  );
}
