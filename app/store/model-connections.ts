import { nanoid } from "nanoid";
import {
  apiPresetMap,
  apiPresets,
  connectionBaseUrl,
  isPresetAllowedForRole,
} from "@/data/api-presets";
import type { LLMModel, ReasoningEffort } from "@/services/llm/schema";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "@/services/llm/reasoning";
import {
  ApiConnection,
  ApiPreset,
  ApiProfileSettings,
  ApiType,
  MODEL_ROLES,
  ModelRole,
  ModelRoleAssignment,
  ModelRoleSettings,
  RoleModelChoice,
} from "@/types";

export const DEFAULT_TTS_VOICE = "alloy";

export type RoleAssignments = Record<ModelRole, ModelRoleAssignment>;

export interface NewConnection {
  preset: ApiPreset;
  baseUrl?: string;
  apiKey?: string;
  label?: string;
}

/** A role's provider settings as saved before connections, one profile per preset. */
export interface LegacyRoleSettings {
  activePreset: ApiPreset;
  profiles: Record<ApiPreset, ApiProfileSettings>;
  retiredProfiles?: Record<string, ApiProfileSettings>;
  baseUrl: string;
  apiKey: string;
  model: LLMModel | undefined;
  reasoningEffort?: ReasoningEffort;
  voice?: string;
}

export function usesReasoning(role: ModelRole): boolean {
  return role === "narrator" || role === "utility";
}

export function createDefaultRoleAssignments(): RoleAssignments {
  return {
    narrator: { connectionId: null, model: undefined },
    utility: { connectionId: null, model: undefined, sameAsNarrator: true },
    speechToText: { connectionId: null, model: undefined },
    textToSpeech: {
      connectionId: null,
      model: undefined,
      voice: DEFAULT_TTS_VOICE,
    },
  };
}

export function normalizeRoleAssignments(
  input?: Partial<Record<ModelRole, Partial<ModelRoleAssignment>>>,
): RoleAssignments {
  const defaults = createDefaultRoleAssignments();
  return Object.fromEntries(
    MODEL_ROLES.map((role) => [role, { ...defaults[role], ...input?.[role] }]),
  ) as RoleAssignments;
}

export function normalizeConnections(input: unknown): ApiConnection[] {
  if (!Array.isArray(input)) return [];
  const connections: ApiConnection[] = [];
  for (const item of input as Partial<ApiConnection>[]) {
    if (!item?.id || connections.some((c) => c.id === item.id)) continue;
    connections.push({
      id: item.id,
      // A connection to a removed preset keeps working as a generic address.
      preset:
        item.preset && Object.hasOwn(apiPresetMap, item.preset)
          ? item.preset
          : ApiPreset.GENERIC,
      baseUrl: item.baseUrl ?? "",
      apiKey: item.apiKey ?? "",
      ...(item.label ? { label: item.label } : {}),
    });
  }
  return connections;
}

/** The assignment a role runs on: a utility that follows the narrator uses the narrator's. */
export function effectiveAssignment(
  assignments: RoleAssignments,
  role: ModelRole,
): ModelRoleAssignment {
  return role === "utility" && assignments.utility.sameAsNarrator
    ? assignments.narrator
    : assignments[role];
}

export function findConnection(
  connections: readonly ApiConnection[],
  id: string | null | undefined,
): ApiConnection | undefined {
  return id ? connections.find((c) => c.id === id) : undefined;
}

export function roleConnection(
  connections: readonly ApiConnection[],
  assignments: RoleAssignments,
  role: ModelRole,
): ApiConnection | undefined {
  const connection = findConnection(
    connections,
    effectiveAssignment(assignments, role).connectionId,
  );
  return connection && isPresetAllowedForRole(connection.preset, role)
    ? connection
    : undefined;
}

export function resolveRoleSettings(
  connections: readonly ApiConnection[],
  assignments: RoleAssignments,
  role: ModelRole,
): ModelRoleSettings {
  const voice =
    role === "textToSpeech"
      ? { voice: assignments.textToSpeech.voice ?? DEFAULT_TTS_VOICE }
      : {};
  const connection = roleConnection(connections, assignments, role);
  if (!connection) {
    return {
      connectionId: null,
      apiType: ApiType.OPENAI,
      activePreset: ApiPreset.GENERIC,
      baseUrl: "",
      apiKey: "",
      model: undefined,
      ...voice,
    };
  }
  const assignment = effectiveAssignment(assignments, role);
  return {
    connectionId: connection.id,
    apiType: ApiType.OPENAI,
    activePreset: connection.preset,
    baseUrl: connectionBaseUrl(connection),
    apiKey: connection.preset === ApiPreset.CHATGPT ? "" : connection.apiKey,
    model: assignment.model,
    reasoningEffort: usesReasoning(role)
      ? assignment.reasoningEffort
      : undefined,
    ...voice,
  };
}

function sameSettings(a: ModelRoleSettings, b: ModelRoleSettings) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) =>
      a[key as keyof ModelRoleSettings] === b[key as keyof ModelRoleSettings],
  );
}

/** Resolves every role, reusing unchanged objects so subscribers to one role don't re-render. */
export function resolveModelRoles(
  connections: readonly ApiConnection[],
  assignments: RoleAssignments,
  previous?: Partial<Record<ModelRole, ModelRoleSettings>>,
): Record<ModelRole, ModelRoleSettings> {
  return Object.fromEntries(
    MODEL_ROLES.map((role) => {
      const next = resolveRoleSettings(connections, assignments, role);
      const prev = previous?.[role];
      return [role, prev && sameSettings(prev, next) ? prev : next];
    }),
  ) as Record<ModelRole, ModelRoleSettings>;
}

/** Drops a thinking level the model on this connection doesn't offer. */
export function normalizeChoice<T extends RoleModelChoice>(
  choice: T,
  connection: ApiConnection | undefined,
): T {
  const reasoning = getModelReasoning(
    choice.model,
    reasoningProvider(
      connection ? connectionBaseUrl(connection) : "",
      connection?.preset === ApiPreset.CHATGPT,
    ),
  );
  return {
    ...choice,
    reasoningEffort: normalizeReasoningEffort(
      choice.reasoningEffort,
      reasoning,
    ),
  };
}

function connectionKey(
  connection: Pick<ApiConnection, "preset" | "baseUrl" | "apiKey">,
) {
  if (connection.preset === ApiPreset.CHATGPT) return ApiPreset.CHATGPT;
  return [
    connection.preset,
    connectionBaseUrl(connection).replace(/\/+$/, ""),
    connection.apiKey.trim(),
  ].join("\n");
}

/** An existing connection to the same account and address; ChatGPT has only one. */
export function findMatchingConnection(
  connections: readonly ApiConnection[],
  candidate: Pick<ApiConnection, "preset" | "baseUrl" | "apiKey">,
): ApiConnection | undefined {
  const key = connectionKey(candidate);
  return connections.find((c) => connectionKey(c) === key);
}

export function createConnection(input: NewConnection): ApiConnection {
  const preset = apiPresetMap[input.preset];
  const label = input.label?.trim();
  return {
    id: nanoid(10),
    preset: input.preset,
    baseUrl: preset.editableUrl ? (input.baseUrl ?? "").trim() : preset.baseUrl,
    apiKey:
      input.preset === ApiPreset.CHATGPT ? "" : (input.apiKey ?? "").trim(),
    ...(label ? { label } : {}),
  };
}

/** Moves a role to another connection, restoring the model it last used there. */
export function switchConnection(
  assignment: ModelRoleAssignment,
  connectionId: string | null,
): ModelRoleAssignment {
  if (assignment.connectionId === connectionId) return assignment;
  const savedModels = { ...assignment.savedModels };
  if (assignment.connectionId && assignment.model) {
    savedModels[assignment.connectionId] = {
      model: assignment.model,
      reasoningEffort: assignment.reasoningEffort,
    };
  }
  const restored = connectionId ? savedModels[connectionId] : undefined;
  if (connectionId) delete savedModels[connectionId];
  return {
    ...assignment,
    connectionId,
    model: restored?.model,
    reasoningEffort: restored?.reasoningEffort,
    savedModels,
  };
}

/** Applies a change to every role's choice on one connection, current or saved. */
export function updateChoicesOn(
  assignments: RoleAssignments,
  connectionId: string,
  update: (choice: RoleModelChoice) => RoleModelChoice | undefined,
): RoleAssignments {
  return Object.fromEntries(
    MODEL_ROLES.map((role) => {
      const assignment = assignments[role];
      const savedModels = { ...assignment.savedModels };
      const saved = savedModels[connectionId];
      if (saved) {
        const next = update(saved);
        if (next?.model) savedModels[connectionId] = next;
        else delete savedModels[connectionId];
      }
      if (assignment.connectionId !== connectionId) {
        return [role, { ...assignment, savedModels }];
      }
      const next = update(assignment);
      return [
        role,
        {
          ...assignment,
          connectionId: next ? connectionId : null,
          model: next?.model,
          reasoningEffort: next?.reasoningEffort,
          savedModels,
        },
      ];
    }),
  ) as RoleAssignments;
}

function worthKeeping(
  preset: ApiPreset,
  profile: ApiProfileSettings,
  active: boolean,
) {
  if (preset === ApiPreset.CHATGPT) return active || Boolean(profile.model);
  // A key or model is kept even when an address was never saved, so it isn't lost.
  const saved = Boolean(profile.apiKey?.trim() || profile.model);
  if (apiPresetMap[preset].editableUrl) {
    return saved || Boolean(profile.baseUrl?.trim());
  }
  return active || saved;
}

/**
 * Turns per-role provider profiles into shared connections. Identical accounts
 * become one connection, and every saved key is kept even if no role uses it.
 */
export function connectionsFromLegacyRoles(
  roles: Record<ModelRole, LegacyRoleSettings>,
): { connections: ApiConnection[]; roleAssignments: RoleAssignments } {
  const connections: ApiConnection[] = [];
  const connect = (preset: ApiPreset, profile: ApiProfileSettings) => {
    const candidate = {
      preset,
      baseUrl: profile.baseUrl ?? "",
      apiKey: profile.apiKey ?? "",
    };
    const existing = findMatchingConnection(connections, candidate);
    if (existing) return existing.id;
    const connection = createConnection(candidate);
    connections.push(connection);
    return connection.id;
  };

  // Connections in use come first.
  const activeIds = Object.fromEntries(
    MODEL_ROLES.map((role) => {
      const legacy = roles[role];
      const profile = {
        baseUrl: legacy.baseUrl,
        apiKey: legacy.apiKey,
        model: legacy.model,
      };
      return [
        role,
        isPresetAllowedForRole(legacy.activePreset, role) &&
        worthKeeping(legacy.activePreset, profile, true)
          ? connect(legacy.activePreset, profile)
          : null,
      ];
    }),
  ) as Record<ModelRole, string | null>;

  const roleAssignments = createDefaultRoleAssignments();
  for (const role of MODEL_ROLES) {
    const legacy = roles[role];
    const connectionId = activeIds[role];
    const savedModels: Record<string, RoleModelChoice> = {};
    for (const { id: preset } of apiPresets) {
      const profile = legacy.profiles[preset];
      if (
        preset === legacy.activePreset ||
        !profile ||
        !isPresetAllowedForRole(preset, role) ||
        !worthKeeping(preset, profile, false)
      ) {
        continue;
      }
      const id = connect(preset, profile);
      if (profile.model && id !== connectionId) {
        savedModels[id] = {
          model: profile.model,
          reasoningEffort: usesReasoning(role)
            ? profile.reasoningEffort
            : undefined,
        };
      }
    }
    for (const profile of Object.values(legacy.retiredProfiles ?? {})) {
      if (worthKeeping(ApiPreset.GENERIC, profile, false)) {
        connect(ApiPreset.GENERIC, profile);
      }
    }
    roleAssignments[role] = {
      connectionId,
      model: connectionId ? legacy.model : undefined,
      reasoningEffort:
        connectionId && usesReasoning(role)
          ? legacy.reasoningEffort
          : undefined,
      ...(role === "textToSpeech"
        ? { voice: legacy.voice ?? DEFAULT_TTS_VOICE }
        : {}),
      ...(Object.keys(savedModels).length > 0 ? { savedModels } : {}),
    };
  }

  // A utility that matched the narrator, or was never set up, follows it.
  const { narrator, utility } = roleAssignments;
  utility.sameAsNarrator =
    utility.connectionId === null ||
    (utility.connectionId === narrator.connectionId &&
      utility.model?.id === narrator.model?.id &&
      utility.reasoningEffort === narrator.reasoningEffort);

  return { connections, roleAssignments };
}
