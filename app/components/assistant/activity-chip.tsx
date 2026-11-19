import type { ComponentType } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  BookOpenIcon,
  BotIcon,
  FileTextIcon,
  GlobeIcon,
  LibraryIcon,
  Loader2Icon,
  MapPinIcon,
  PanelsTopLeftIcon,
  PlayIcon,
  ScrollTextIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssistantActivity } from "@/types/assistant.type";

const TOOL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  get_context: MapPinIcon,
  list_library: LibraryIcon,
  get_tale: BookOpenIcon,
  read_log: ScrollTextIcon,
  search_log: SearchIcon,
  get_scenario: FileTextIcon,
  start_tale: PlayIcon,
  show: PanelsTopLeftIcon,
  settings: SlidersHorizontalIcon,
  ai_setup: BotIcon,
  library: LibraryIcon,
  catalog: GlobeIcon,
};

function usePlaceName() {
  const { t } = useLingui();
  return (place: string): string => {
    const [kind, id] = place.split(":");
    if (kind === "settings")
      switch (id) {
        case "appearance":
          return t`Appearance`;
        case "ai-setup":
          return t`AI Setup`;
        case "generation":
          return t`Generation`;
        case "prompting":
          return t`Prompting`;
        case "cloud-sync":
          return t`Account & Sync`;
        case "maintenance":
          return t`Updates`;
        case "about":
          return t`About`;
        default:
          return t`Settings`;
      }
    if (kind === "panel")
      switch (id) {
        case "story":
          return t`Story`;
        case "cards":
          return t`Cards`;
        case "character":
          return t`Character`;
        case "ai":
          return t`AI`;
        default:
          return t`Display`;
      }
    switch (id) {
      case "tales":
        return t`Tales`;
      case "scenarios":
      case "scenario":
      case "catalog_scenario":
        return t`Scenarios`;
      case "discover":
        return t`Discover`;
      case "published":
        return t`Published`;
      case "scenario_editor":
        return t`Edit Scenario`;
      case "new_scenario":
        return t`New scenario`;
      case "quickstart":
        return t`Quickstart`;
      case "play":
        return t`Play`;
      default:
        return t`Home`;
    }
  };
}

function useActivityLabel() {
  const { t } = useLingui();
  const placeName = usePlaceName();
  return (activity: AssistantActivity, running?: boolean): string => {
    const detail = activity.detail ?? "";
    const result = activity.result;
    const failed = Boolean(activity.error);
    const names = activity.confirm?.names ?? [];
    const count = names.length;
    const [first] = names;
    if (activity.confirm?.answer === "no") return t`Cancelled`;
    if (running && activity.confirm && !activity.confirm.answer)
      return t`Waiting for you`;
    if (running)
      switch (activity.tool) {
        case "update_tale":
          return t`Changing the tale`;
        case "edit_story_cards":
          return t`Changing the story cards`;
        case "edit_character":
          return t`Changing the character`;
        case "edit_log":
          return t`Changing the story`;
        case "edit_scenario":
          return t`Changing the scenario`;
        case "scenario_from_tale":
          return t`Saving the tale as a scenario`;
        case "start_tale":
          return t`Starting a tale`;
        case "show":
          return t`Opening`;
        case "settings":
          return activity.action === "set"
            ? t`Changing the settings`
            : t`Checking the settings`;
        case "ai_setup":
          return activity.action === "set"
            ? t`Changing AI Setup`
            : t`Checking AI Setup`;
        case "library":
          return t`Changing your library`;
        case "catalog":
          return t`Checking the catalog`;
      }
    switch (activity.tool) {
      case "get_context":
        return t`Checked where you are`;
      case "list_library":
        return detail === "scenarios"
          ? t`Looked through your scenarios`
          : t`Looked through your tales`;
      case "get_tale":
        return t`Read the tale's setup`;
      case "read_log":
        return t`Read the story`;
      case "search_log":
        return t`Searched the story for “${detail}”`;
      case "get_scenario":
        return t`Read a scenario`;
      case "update_tale":
        return t`Couldn't change the tale`;
      case "edit_story_cards":
        return t`Couldn't change the story cards`;
      case "edit_character":
        return t`Couldn't change the character`;
      case "edit_log":
        return t`Couldn't change the story`;
      case "edit_scenario":
        return t`Couldn't change the scenario`;
      case "scenario_from_tale":
        return t`Couldn't save the tale as a scenario`;
      case "start_tale":
        return failed
          ? t`Couldn't start the tale`
          : result
            ? t`Started “${result}”`
            : t`Read the scenario's questions`;
      case "show":
        if (failed) return t`Couldn't open that`;
        return result ? t`Opened “${result}”` : t`Opened ${placeName(detail)}`;
      case "settings":
        if (failed) return t`Couldn't change the settings`;
        return activity.action === "check_updates"
          ? t`Checked for updates`
          : t`Checked the settings`;
      case "ai_setup":
        if (failed) return t`Couldn't change AI Setup`;
        return activity.action === "get"
          ? t`Checked AI Setup`
          : t`Looked through the models`;
      case "library":
        if (failed) return t`Couldn't change your library`;
        switch (activity.action) {
          case "delete":
            return count === 1
              ? t`Deleted “${first}”`
              : detail === "scenario"
                ? t`Deleted ${count} scenarios`
                : t`Deleted ${count} tales`;
          case "sync":
            return t`Started syncing`;
          case "stop_syncing":
            return count === 1
              ? t`Removed “${first}” from the cloud`
              : t`Removed ${count} tales from the cloud`;
          case "resolve_conflict":
            return t`Settled a sync conflict`;
          case "export":
            return t`Copied the scenario`;
          case "import":
            return t`Opened the copied scenario`;
          default:
            return t`Changed your library`;
        }
      case "catalog":
        if (failed)
          return activity.action === "unpublish"
            ? t`Couldn't unpublish`
            : t`Couldn't reach the catalog`;
        switch (activity.action) {
          case "search":
            return detail
              ? t`Searched the catalog for “${detail}”`
              : t`Looked through the catalog`;
          case "get":
            return t`Read a catalog scenario`;
          case "tags":
            return t`Looked through the catalog's tags`;
          case "published":
            return t`Looked through your published scenarios`;
          case "unpublish":
            return t`Unpublished “${first}”`;
          default:
            return t`Looked through the catalog`;
        }
      default:
        return activity.tool;
    }
  };
}

export function ActivityChip({
  activity,
  running,
}: {
  activity: AssistantActivity;
  running?: boolean;
}) {
  const label = useActivityLabel()(activity, running);
  const Icon = running
    ? Loader2Icon
    : (TOOL_ICONS[activity.tool] ?? WrenchIcon);
  return (
    <Badge
      variant="outline"
      title={activity.error}
      className={cn(
        "sidebar-chip max-w-full justify-start border-sidebar-border/80 bg-sidebar-accent/35 font-normal text-sidebar-foreground/85 dark:border-sidebar-foreground/25 dark:bg-sidebar-accent/60",
        activity.error && "border-destructive/40 text-destructive",
      )}
    >
      <Icon className={cn("shrink-0", running && "animate-spin")} />
      <span dir="auto" className="truncate">
        {label}
      </span>
    </Badge>
  );
}
