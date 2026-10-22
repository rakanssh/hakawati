import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDownIcon } from "lucide-react";
import { fontPresets, type FontOption } from "@/data/font-presets";
import { THEME_FONT } from "@/themes/registry";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store";
import { useIsMobile } from "@/hooks/useIsMobile";

export function FontSelector() {
  const { fontFamily, setFontFamily } = useSettingsStore();
  const [fontSelectOpen, setFontSelectOpen] = useState(false);
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useDrawer = isCompactViewport || isMobilePlatform;
  const { t } = useLingui();
  const isThemeFont = (font: FontOption) => font.value === THEME_FONT;
  const fontLabel = (font: FontOption) =>
    isThemeFont(font) ? t`Theme font` : font.name;
  const fontPreview = (font: FontOption) =>
    isThemeFont(font) ? t`The type each theme was designed with` : font.preview;
  const fontStyle = (font: FontOption) =>
    isThemeFont(font) ? undefined : { fontFamily: font.value };

  const currentFont = useMemo(() => {
    return (
      fontPresets.find((font) => font.value === fontFamily) || fontPresets[0]
    );
  }, [fontFamily]);

  const fontList = (
    <CommandList className={cn(useDrawer && "max-h-[72dvh]")}>
      <CommandEmpty>
        <Trans>No font found.</Trans>
      </CommandEmpty>
      {fontPresets.map((font) => (
        <CommandItem
          key={font.id}
          value={fontLabel(font)}
          onSelect={() => {
            setFontFamily(font.value);
            setFontSelectOpen(false);
          }}
          className={cn(
            "rounded-xs p-3 ml-0 min-h-[44px]",
            fontFamily === font.value && "border-s-2 border-foreground",
          )}
        >
          <div className="flex w-full items-center justify-between">
            <span style={fontStyle(font)}>{fontLabel(font)}</span>
            {fontPreview(font) && (
              <span
                className="ms-2 text-xs text-muted-foreground"
                style={fontStyle(font)}
              >
                {fontPreview(font)}
              </span>
            )}
          </div>
        </CommandItem>
      ))}
    </CommandList>
  );

  if (useDrawer) {
    return (
      <Drawer open={fontSelectOpen} onOpenChange={setFontSelectOpen}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={fontSelectOpen}
          className="w-full justify-between"
          onClick={() => setFontSelectOpen(true)}
        >
          <span style={fontStyle(currentFont)}>{fontLabel(currentFont)}</span>
          <ChevronsUpDownIcon className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <DrawerContent className="min-h-[60dvh]">
          <DrawerHeader>
            <DrawerTitle>
              <Trans>Select Font</Trans>
            </DrawerTitle>
          </DrawerHeader>
          <Command className="border-none">
            <CommandInput
              placeholder={t`Search fonts...`}
              className="rounded-xs"
            />
            {fontList}
          </Command>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={fontSelectOpen} onOpenChange={setFontSelectOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={fontSelectOpen}
          className="w-full justify-between"
        >
          <span style={fontStyle(currentFont)}>{fontLabel(currentFont)}</span>
          <ChevronsUpDownIcon className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-full p-0 rounded-xs">
        <Command>
          <CommandInput
            placeholder={t`Search fonts...`}
            className="rounded-xs"
          />
          {fontList}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
