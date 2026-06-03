import {
  MonitorIcon,
  MoonIcon,
  RocketIcon,
  ScrollTextIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "../theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { ThemeDefinition, ThemeId } from "@/lib/themes";

function ThemeIcon({ icon }: { icon: ThemeDefinition["icon"] }) {
  switch (icon) {
    case "monitor":
      return <MonitorIcon className="h-4 w-4" />;
    case "sun":
      return <SunIcon className="h-4 w-4" />;
    case "moon":
      return <MoonIcon className="h-4 w-4" />;
    case "scroll":
      return <ScrollTextIcon className="h-4 w-4" />;
    case "rocket":
      return <RocketIcon className="h-4 w-4" />;
  }
}

export function ThemeToggle() {
  const { theme, themes, setTheme } = useTheme();
  const activeTheme = themes.find((item) => item.id === theme) ?? themes[0];

  return (
    <Select value={theme} onValueChange={(value) => setTheme(value as ThemeId)}>
      <SelectTrigger
        className="w-auto gap-2"
        aria-label="Select theme"
        title="Select theme"
      >
        <ThemeIcon icon={activeTheme.icon} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {themes.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            <span className="flex items-center gap-2">
              <ThemeIcon icon={item.icon} />
              {item.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
