import { apiPresetMap } from "@/data/api-presets";
import { ApiPreset, MODEL_ROLES, type ModelRole } from "@/types";

/** AI Setup's subpages, kept in the settings header's back stack as strings. */
export type AiSetupPage =
  | { kind: "role"; role: ModelRole }
  | { kind: "models"; role: ModelRole }
  | { kind: "add"; role?: ModelRole }
  | { kind: "new"; preset: ApiPreset; role?: ModelRole }
  | { kind: "connection"; id: string };

export function pageKey(page: AiSetupPage): string {
  switch (page.kind) {
    case "role":
    case "models":
      return `${page.kind}:${page.role}`;
    case "add":
      return page.role ? `add:${page.role}` : "add";
    case "new":
      return ["new", page.preset, page.role].filter(Boolean).join(":");
    case "connection":
      return `connection:${page.id}`;
  }
}

function asRole(value: string | undefined): ModelRole | undefined {
  return MODEL_ROLES.find((role) => role === value);
}

export function parsePage(key: string | null): AiSetupPage | null {
  if (!key) return null;
  const [kind, first, second] = key.split(":");
  switch (kind) {
    case "role":
    case "models": {
      const role = asRole(first);
      return role ? { kind, role } : null;
    }
    case "add":
      return { kind, role: asRole(first) };
    case "new":
      return Object.hasOwn(apiPresetMap, first)
        ? { kind, preset: first as ApiPreset, role: asRole(second) }
        : null;
    case "connection":
      return first ? { kind, id: first } : null;
    default:
      return null;
  }
}
