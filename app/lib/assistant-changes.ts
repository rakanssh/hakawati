import type {
  AppChange,
  AssistantChange,
  ScenarioChange,
  TaleChange,
} from "@/types/assistant.type";

export const isScenarioChange = (
  change: AssistantChange,
): change is ScenarioChange => change.kind === "scenario";

export const isAppChange = (change: AssistantChange): change is AppChange =>
  change.kind === "setting" || change.kind === "role";

export const isTaleChange = (change: AssistantChange): change is TaleChange =>
  !isScenarioChange(change) && !isAppChange(change);
