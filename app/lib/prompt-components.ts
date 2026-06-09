import { PromptComponent, PromptComponentType } from "@/types/context.type";
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

  const normalized: PromptComponent[] = [];
  for (const component of components ?? []) {
    if (
      !component ||
      !allowedTypes.includes(component.type) ||
      seen.has(component.type)
    ) {
      continue;
    }

    seen.add(component.type);
    normalized.push({
      id: component.id || nanoid(12),
      type: component.type,
      content: component.content ?? "",
      createdAt: component.createdAt || now,
      updatedAt: component.updatedAt || now,
    });
  }

  return normalized;
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
