import { isPresetAllowedForRole } from "@/data/api-presets";
import { matchModels } from "@/lib/model-match";
import { getModelReasoning, reasoningProvider } from "@/lib/reasoning";
import { getConnectionModels } from "@/services/llm";
import { chooseRoleModel } from "@/services/model-choice";
import {
  canFollowNarrator,
  type FollowingRole,
  findConnection,
  usesReasoning,
} from "@/store/model-connections";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  ApiPreset,
  GameMode,
  type ApiConnection,
  type LLMModel,
  type ModelRole,
  type ReasoningEffort,
} from "@/types";
import { changeRole } from "../app-changes";
import {
  defineTool,
  objectSchema,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { errorMessage } from "./read";

const ROLES = {
  narrator: "narrator",
  helper: "utility",
  hakawati: "hakawati",
  speech_to_text: "speechToText",
  text_to_speech: "textToSpeech",
} as const satisfies Record<string, ModelRole>;

type RoleName = keyof typeof ROLES;
const ROLE_NAMES = Object.keys(ROLES) as RoleName[];
const nameOfRole = (role: ModelRole) =>
  ROLE_NAMES.find((name) => ROLES[name] === role)!;

const THINKING = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const settings = () => useSettingsStore.getState();

const connectionName = (connection: ApiConnection) =>
  connection.label ?? connection.preset;

function describeConnection(connection: ApiConnection) {
  return {
    id: connection.id,
    name: connectionName(connection),
    preset: connection.preset,
  };
}

function findConnectionByWords(words: string): ApiConnection {
  const wanted = words.trim().toLowerCase();
  const { connections } = settings();
  const found =
    connections.find((c) => c.id === words.trim()) ??
    connections.find((c) => connectionName(c).toLowerCase() === wanted) ??
    connections.filter((c) => c.preset === wanted).at(0);
  if (!found)
    throw new Error(
      "No connection matches that. ai_setup get lists them; adding one is done by the player in Settings › AI Setup.",
    );
  return found;
}

function reasoningOf(model: LLMModel | undefined, connection: ApiConnection) {
  return getModelReasoning(
    model,
    reasoningProvider(
      connection.baseUrl,
      connection.preset === ApiPreset.CHATGPT,
    ),
  );
}

function describeModel(model: LLMModel, connection: ApiConnection) {
  const efforts = reasoningOf(model, connection)?.supportedEfforts;
  return {
    id: model.id,
    name: model.name,
    ...(model.contextLength ? { context: model.contextLength } : {}),
    ...(model.supportsToolCalls !== undefined
      ? { tools: model.supportsToolCalls }
      : {}),
    ...(efforts?.length ? { thinking: efforts } : {}),
    ...(model.supportedVoices?.length
      ? { voices: model.supportedVoices.slice(0, 12) }
      : {}),
  };
}

async function modelsOf(connection: ApiConnection, signal?: AbortSignal) {
  try {
    return await getConnectionModels(connection, signal);
  } catch (error) {
    throw new Error(
      `Couldn't list ${connectionName(connection)}'s models: ${errorMessage(error)}. The player can check the connection in Settings › AI Setup.`,
    );
  }
}

/** True when a change to this role changes the model Hakawati itself is running on. */
function movesHakawati(role: ModelRole) {
  return (
    role === "hakawati" ||
    (role === "narrator" &&
      Boolean(settings().roleAssignments.hakawati.sameAsNarrator))
  );
}

export function createAiSetupTools(
  context: AssistantToolContext,
): AssistantTool[] {
  return [
    defineTool({
      name: "ai_setup",
      description:
        "See and change which model each AI role uses, its thinking level and the narration voice, using the player's existing connections. get shows the setup; models lists a connection's models. Never handles API keys, addresses, adding connections or signing in: for those, show the player Settings › AI Setup.",
      parameters: objectSchema(
        {
          action: { type: "string", enum: ["get", "models", "set"] },
          role: { type: "string", enum: ROLE_NAMES },
          connection: {
            type: "string",
            description: "A connection's id or name from get.",
          },
          model: {
            type: "string",
            description: "A model id, or words from its name.",
          },
          query: { type: "string", description: "models: filter by words." },
          sameAsNarrator: {
            type: "boolean",
            description: "helper and hakawati: follow the narrator's model.",
          },
          thinking: { type: "string", enum: [...THINKING] },
          voice: { type: "string", description: "text_to_speech only." },
        },
        ["action"],
      ),
      detail: (args) => text(args.role),
      run: async (args, signal) => {
        const state = settings();
        if (args.action === "get") {
          return {
            connections: state.connections.map(describeConnection),
            roles: Object.fromEntries(
              ROLE_NAMES.map((name) => {
                const role = ROLES[name];
                const assignment = state.roleAssignments[role];
                const resolved = state.modelRoles[role];
                return [
                  name,
                  {
                    ready: isModelRoleConfigured(resolved),
                    ...(canFollowNarrator(role) && assignment.sameAsNarrator
                      ? { sameAsNarrator: true }
                      : {}),
                    connection: resolved.connectionId,
                    model: resolved.model
                      ? { id: resolved.model.id, name: resolved.model.name }
                      : null,
                    ...(usesReasoning(role)
                      ? { thinking: assignment.reasoningEffort ?? "default" }
                      : {}),
                    ...(role === "textToSpeech"
                      ? { voice: resolved.voice ?? null }
                      : {}),
                  },
                ];
              }),
            ),
            readNarrationAloud: state.autoNarrate,
          };
        }

        const roleName = text(args.role) as RoleName | undefined;
        const role = roleName ? ROLES[roleName] : undefined;
        if (args.action === "models") {
          const connection = text(args.connection)
            ? findConnectionByWords(text(args.connection)!)
            : role
              ? findConnection(
                  state.connections,
                  state.modelRoles[role].connectionId,
                )
              : undefined;
          if (!connection)
            throw new Error(
              "models needs a connection, or a role that has one.",
            );
          const models = await modelsOf(connection, signal);
          const query = text(args.query);
          const shown = query ? matchModels(models, query) : models;
          return {
            connection: describeConnection(connection),
            total: models.length,
            models: shown.slice(0, 40).map((m) => describeModel(m, connection)),
          };
        }
        if (args.action !== "set")
          throw new Error("action must be get, models or set.");
        if (!role) throw new Error(`set needs role: ${ROLE_NAMES.join(", ")}.`);

        const following = canFollowNarrator(role);
        const sameAsNarrator =
          typeof args.sameAsNarrator === "boolean"
            ? args.sameAsNarrator
            : undefined;
        if (sameAsNarrator !== undefined && !following)
          throw new Error("Only helper and hakawati can follow the narrator.");

        let connection: ApiConnection | undefined;
        if (text(args.connection)) {
          connection = findConnectionByWords(text(args.connection)!);
          if (!isPresetAllowedForRole(connection.preset, role))
            throw new Error(
              `${connectionName(connection)} can't be used for ${roleName}.`,
            );
        }
        const modelWords = text(args.model);
        const ownConnection = findConnection(
          state.connections,
          state.roleAssignments[role].connectionId,
        );
        const modelConnection =
          connection ??
          (following && state.roleAssignments[role].sameAsNarrator
            ? findConnection(
                state.connections,
                state.roleAssignments.narrator.connectionId,
              )
            : ownConnection);
        let model: LLMModel | undefined;
        if (modelWords) {
          if (!modelConnection)
            throw new Error(
              `${roleName} has no connection yet. Give connection, or ask the player to set one in Settings › AI Setup.`,
            );
          const models = await modelsOf(modelConnection, signal);
          const found = matchModels(models, modelWords);
          if (!found.length)
            throw new Error(
              `No model on ${connectionName(modelConnection)} matches “${modelWords}”. Use models to look.`,
            );
          if (found.length > 1)
            return {
              changed: false,
              ambiguous: found
                .slice(0, 10)
                .map((m) => ({ id: m.id, name: m.name })),
            };
          model = found[0];
        }

        const thinking = text(args.thinking);
        let effort: ReasoningEffort | undefined;
        if (thinking !== undefined) {
          if (!usesReasoning(role))
            throw new Error(`${roleName} has no thinking level.`);
          if (!THINKING.includes(thinking as (typeof THINKING)[number]))
            throw new Error(`thinking must be one of: ${THINKING.join(", ")}.`);
          if (thinking !== "default") {
            const target = model ?? state.modelRoles[role].model;
            const where = modelConnection ?? ownConnection;
            const efforts =
              target && where
                ? reasoningOf(target, where)?.supportedEfforts
                : undefined;
            if (efforts && !efforts.includes(thinking as ReasoningEffort))
              throw new Error(
                efforts.length
                  ? `That model's thinking levels are: ${efforts.join(", ")}.`
                  : "That model has no thinking levels.",
              );
            effort = thinking as ReasoningEffort;
          }
        }

        const voice = text(args.voice);
        if (voice !== undefined) {
          if (role !== "textToSpeech")
            throw new Error("Only text_to_speech has a voice.");
          const voices = (model ?? state.modelRoles.textToSpeech.model)
            ?.supportedVoices;
          if (voices?.length && !voices.includes(voice))
            throw new Error(`The voices are: ${voices.join(", ")}.`);
        }

        const warnings: string[] = [];
        if (model && !model.supportsToolCalls) {
          if (role === "hakawati")
            warnings.push(
              "This model may not be able to call tools, so Hakawati may not be able to make changes.",
            );
          if (
            role === "narrator" &&
            useTaleStore.getState().gameMode === GameMode.GM
          )
            warnings.push(
              "This model may not be able to call tools, so Game Master mode may not work properly.",
            );
        }

        const target = connection ?? (model ? modelConnection : undefined);
        const apply = () => {
          const store = settings();
          if (sameAsNarrator === false)
            store.setRoleSameAsNarrator(role as FollowingRole, false);
          if (
            target &&
            (target.id !== store.roleAssignments[role].connectionId ||
              store.roleAssignments[role].sameAsNarrator)
          )
            store.setRoleConnection(role, target.id);
          if (model) chooseRoleModel(role, model);
          if (thinking !== undefined)
            store.setRoleReasoningEffort(role, effort);
          if (voice !== undefined) store.setRoleVoice(role, voice);
          if (sameAsNarrator === true)
            store.setRoleSameAsNarrator(role as FollowingRole, true);
        };
        const label = model?.name ?? (target ? connectionName(target) : "");
        const commit = () => {
          const change = changeRole(role, label, apply);
          if (change) context.recordChanges?.([change]);
          return change;
        };

        if (movesHakawati(role) && context.afterRun) {
          context.afterRun(() => void commit());
          return {
            changed: true,
            appliesAfterThisReply: true,
            ...(model ? { model: model.id } : {}),
            ...(warnings.length ? { warnings } : {}),
          };
        }
        const change = commit();
        return {
          changed: Boolean(change),
          role: nameOfRole(role),
          ...(model ? { model: model.id } : {}),
          ...(warnings.length ? { warnings } : {}),
        };
      },
    }),
  ];
}
