import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { fontPresets } from "@/data/font-presets";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store";

export function FontSelector() {
  const { fontFamily, setFontFamily } = useSettingsStore();
  const [fontSelectOpen, setFontSelectOpen] = useState(false);

  const currentFont = useMemo(() => {
    return (
      fontPresets.find((font) => font.value === fontFamily) || fontPresets[0]
    );
  }, [fontFamily]);

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
          <CommandList>
            <CommandEmpty>No font found.</CommandEmpty>
            {fontPresets.map((font) => (
              <CommandItem
                key={font.id}
                value={font.name}
                onSelect={() => {
                  setFontFamily(font.value);
                  setFontSelectOpen(false);
                }}
                className="rounded-xs p-1 ml-0"
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4",
                    fontFamily === font.value ? "opacity-100" : "opacity-0",
                  )}
                />
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}
