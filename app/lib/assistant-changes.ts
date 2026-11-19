import type {
  AppChange,
  AssistantChange,
  ScenarioChange,
  TaleChange,
} from "@/types/assistant.type";

const TALE_KINDS = new Set<string>([
  "field",
  "component",
  "card",
  "stat",
  "item",
  "passage",
  "insert",
  "delete",
]);

export const isTaleChange = (change: AssistantChange): change is TaleChange =>
  TALE_KINDS.has(change.kind);

export const isScenarioChange = (
  change: AssistantChange,
): change is ScenarioChange => change.kind === "scenario";

export const isAppChange = (change: AssistantChange): change is AppChange =>
  change.kind === "setting" || change.kind === "role";
