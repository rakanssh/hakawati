import { useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import { BotIcon, SlidersHorizontalIcon } from "lucide-react";
import { fontPresets } from "@/data/font-presets";
import { LOCALES, type Locale } from "@/lib/locales";
import { getTheme, isThemeId } from "@/themes/registry";
import type { ModelRole } from "@/types";
import type { AppChange } from "@/types/assistant.type";

export function useAppChangeLabel() {
  const { t } = useLingui();
  const { _ } = useLinguiCore();

  const settingName = (key: string): string => {
    switch (key) {
      case "theme":
        return t`Theme`;
      case "scenery":
        return t`Scenery`;
      case "fontSize":
        return t`Text size`;
      case "uiScale":
        return t`Interface size`;
      case "font":
        return t`Font`;
      case "highlightLatest":
        return t`Highlight the latest passage`;
      case "thinking":
        return t`Show AI thinking`;
      case "language":
        return t`Language`;
      case "direction":
        return t`Direction`;
      case "autoNarrate":
        return t`Read new narration aloud`;
      case "contextWindow":
        return t`Context window`;
      case "maxTokens":
        return t`Max output tokens`;
      case "temperature":
        return t`Temperature`;
      case "topP":
        return t`Top P`;
      case "topK":
        return t`Top K`;
      case "minP":
        return t`Min P`;
      case "topA":
        return t`Top A`;
      case "frequencyPenalty":
        return t`Frequency penalty`;
      case "presencePenalty":
        return t`Presence penalty`;
      case "repetitionPenalty":
        return t`Repetition penalty`;
      case "seed":
        return t`Seed`;
      case "storytellerPrompt":
        return t`AI instructions`;
      case "continuePrompt":
        return t`Continue`;
      case "continueAuthorNote":
        return t`Continue author note`;
      case "gmPrompt":
        return t`Game Master mechanics`;
      case "storyCardPrompt":
        return t`Story card generator`;
      default:
        return key;
    }
  };

  const roleName = (role: ModelRole): string => {
    switch (role) {
      case "narrator":
        return t`Narrator`;
      case "utility":
        return t`Helper`;
      case "hakawati":
        return t`Hakawati`;
      case "speechToText":
        return t`Speech to Text`;
      case "textToSpeech":
        return t`Text to Speech`;
    }
  };

  const valueText = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return t`Default`;
    if (typeof value === "boolean") return value ? t`On` : t`Off`;
    if (key === "theme")
      return value === "system"
        ? t`System`
        : isThemeId(String(value))
          ? _(getTheme(value as never).name)
          : String(value);
    if (key === "language") return LOCALES[value as Locale] ?? String(value);
    if (key === "font")
      return (
        fontPresets.find((font) => font.id === value)?.name ?? String(value)
      );
    if (key === "uiScale" && typeof value === "number")
      return `${Math.round(value * 100)}%`;
    return String(value);
  };

  return (change: AppChange): { Icon: typeof BotIcon; label: string } => {
    if (change.kind === "setting") {
      const name = settingName(change.key);
      if (
        change.after &&
        typeof change.after === "object" &&
        "custom" in change.after
      ) {
        return {
          Icon: SlidersHorizontalIcon,
          label: (change.after as { custom: boolean }).custom
            ? t`Changed ${name}`
            : t`Reset ${name}`,
        };
      }
      const before = valueText(change.key, change.before);
      const after = valueText(change.key, change.after);
      return {
        Icon: SlidersHorizontalIcon,
        label:
          typeof change.after === "number" && typeof change.before === "number"
            ? `${name} ${before} → ${after}`
            : `${name}: ${after}`,
      };
    }
    const role = roleName(change.role);
    const { before, after } = change;
    if (before.sameAsNarrator !== after.sameAsNarrator && after.sameAsNarrator)
      return { Icon: BotIcon, label: `${role}: ${t`Same as Narrator`}` };
    if (
      before.model?.id !== after.model?.id ||
      before.connectionId !== after.connectionId
    )
      return { Icon: BotIcon, label: `${role}: ${change.label}` };
    if (before.reasoningEffort !== after.reasoningEffort)
      return {
        Icon: BotIcon,
        label: t`${role} thinking: ${after.reasoningEffort ?? t`Default`}`,
      };
    if (before.voice !== after.voice)
      return {
        Icon: BotIcon,
        label: `${t`Voice`}: ${after.voice ?? t`Default`}`,
      };
    return { Icon: BotIcon, label: t`Changed ${role}` };
  };
}
