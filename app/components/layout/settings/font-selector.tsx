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
import { fontPresets } from "@/data/font-presets";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store";
import { useIsMobile } from "@/hooks/useIsMobile";

export function FontSelector() {
  const { fontFamily, setFontFamily } = useSettingsStore();
  const [fontSelectOpen, setFontSelectOpen] = useState(false);
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useDrawer = isCompactViewport || isMobilePlatform;

  const currentFont = useMemo(() => {
    return (
      fontPresets.find((font) => font.value === fontFamily) || fontPresets[0]
    );
  }, [fontFamily]);

  const fontList = (
    <CommandList className={cn(useDrawer && "max-h-[72dvh]")}>
      <CommandEmpty>No font found.</CommandEmpty>
      {fontPresets.map((font) => (
        <CommandItem
          key={font.id}
          value={font.name}
          onSelect={() => {
            setFontFamily(font.value);
            setFontSelectOpen(false);
          }}
          className={cn(
            "rounded-xs p-3 ml-0 min-h-[44px]",
            fontFamily === font.value && "border-l-2 border-foreground",
          )}
        >
          <div className="flex w-full items-center justify-between">
            <span style={{ fontFamily: font.value }}>{font.name}</span>
            {font.preview && (
              <span
                className="text-xs text-muted-foreground ml-2"
                style={{ fontFamily: font.value }}
              >
                {font.preview}
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
          <span style={{ fontFamily: currentFont.value }}>
            {currentFont.name}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <DrawerContent className="min-h-[60dvh]">
          <DrawerHeader>
            <DrawerTitle>Select Font</DrawerTitle>
          </DrawerHeader>
          <Command className="border-none">
            <CommandInput
              placeholder="Search fonts..."
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
          <span style={{ fontFamily: currentFont.value }}>
            {currentFont.name}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 rounded-xs">
        <Command>
          <CommandInput placeholder="Search fonts..." className="rounded-xs" />
          {fontList}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
