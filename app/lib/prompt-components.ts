import {
  GameMode,
  PromptComponent,
  PromptComponentType,
} from "@/types/context.type";
import { nanoid } from "nanoid";

export const TALE_COMPONENT_TYPES = [
  PromptComponentType.AI_INSTRUCTIONS,
  PromptComponentType.PLOT,
  PromptComponentType.AUTHOR_NOTE,
] as const;

export const SCENARIO_COMPONENT_TYPES = [
  ...TALE_COMPONENT_TYPES,
  PromptComponentType.OPENING,
] as const;

export function createPromptComponent(
  type: PromptComponentType,
  content = "",
): PromptComponent {
  const now = Date.now();
  return {
    id: nanoid(12),
    type,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

export function getPromptComponent(
  components: PromptComponent[] | undefined,
  type: PromptComponentType,
): PromptComponent | undefined {
  return components?.find((component) => component.type === type);
}

export function getPromptComponentContent(
  components: PromptComponent[] | undefined,
  type: PromptComponentType,
): string {
  return getPromptComponent(components, type)?.content.trim() ?? "";
}

export function normalizePromptComponents(
  components: PromptComponent[] | undefined,
  allowedTypes: readonly PromptComponentType[] = SCENARIO_COMPONENT_TYPES,
): PromptComponent[] {
  const now = Date.now();
  const seen = new Set<PromptComponentType>();
  return (components ?? [])
    .filter((component): component is PromptComponent =>
      Boolean(
        component &&
          allowedTypes.includes(component.type) &&
          !seen.has(component.type),
      ),
    )
    .map((component) => {
      seen.add(component.type);
      return {
        id: component.id || nanoid(12),
        type: component.type,
        content: component.content ?? "",
        createdAt: component.createdAt || now,
        updatedAt: component.updatedAt || now,
      };
    });
}

export function legacyComponentsFromText(input: {
  plot?: string;
  authorNote?: string;
  opening?: string;
  includeOpening?: boolean;
}): PromptComponent[] {
  const components = [
    createPromptComponent(PromptComponentType.PLOT, input.plot ?? ""),
    createPromptComponent(
      PromptComponentType.AUTHOR_NOTE,
      input.authorNote ?? "",
    ),
  ];

  if (input.includeOpening) {
    components.push(
      createPromptComponent(PromptComponentType.OPENING, input.opening ?? ""),
    );
  }

  return components;
}

export function getDefaultInstructionsForMode(
  gameMode: GameMode,
  getStorytellerPrompt: () => string,
  getGmPrompt: () => string,
): string {
  return gameMode === GameMode.GM ? getGmPrompt() : getStorytellerPrompt();
}
