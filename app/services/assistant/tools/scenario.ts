import {
  analyzeScenarioQuestions,
  getScenarioAnswerError,
} from "@/lib/scenario-questions";
import {
  getScenarioById,
  initTaleFromScenario,
} from "@/services/scenario.service";
import {
  getCatalogScenario,
  startCatalogScenario,
} from "@/services/catalog.service";
import { createQuickstartTale } from "@/services/quickstart.service";
import { canSyncNewTales } from "@/services/new-tale-sync";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
  type ScenarioContent,
  type StoryCardContent,
} from "@/types/context.type";
import type { ScenarioChange } from "@/types/assistant.type";
import type { ScenarioEdits } from "../scenario-changes";
import { editScenario, scenarioFromTale } from "../scenario-edits";
import { withTaleWrites } from "../tale-edits";
import {
  defineTool,
  objectSchema,
  requireUi,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { catalogTransport } from "./catalog";
import { errorMessage, taleIdFor, taleIdProperty } from "./read";

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function opList(value: unknown, name: string): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be a list.`);
  return value.map((op) => {
    if (!op || typeof op !== "object" || Array.isArray(op))
      throw new Error(`Each of ${name} must be an object.`);
    return op as Record<string, unknown>;
  });
}

function required(op: Record<string, unknown>, key: string): string {
  const value = text(op[key]);
  if (!value) throw new Error(`${String(op.op)} needs ${key}.`);
  return value;
}

const triggersOf = (op: Record<string, unknown>) =>
  Array.isArray(op.triggers)
    ? op.triggers.filter((t): t is string => typeof t === "string")
    : undefined;

function applyCards(
  edits: ScenarioEdits,
  list: Array<Record<string, unknown>>,
) {
  const added: Array<{ id: string; title: string }> = [];
  for (const op of list) {
    const triggers = triggersOf(op);
    if (op.op === "add") {
      const card = edits.addCard({
        title: required(op, "title"),
        content: optionalString(op.content) ?? "",
        category: optionalString(op.category),
        triggers,
        pinned: op.pinned === true,
      });
      added.push({ id: card.id, title: card.title });
    } else if (op.op === "update") {
      const patch: Partial<StoryCardContent> = {};
      if (text(op.title)) patch.title = text(op.title);
      if (optionalString(op.content) !== undefined)
        patch.content = optionalString(op.content);
      if (optionalString(op.category))
        patch.category = op.category as StorybookCategory;
      if (triggers) patch.triggers = triggers;
      if (typeof op.pinned === "boolean") patch.isPinned = op.pinned;
      edits.updateCard(required(op, "id"), patch);
    } else if (op.op === "remove") edits.removeCard(required(op, "id"));
    else throw new Error("A card op must be add, update or remove.");
  }
  return added;
}

function applyStats(
  edits: ScenarioEdits,
  list: Array<Record<string, unknown>>,
) {
  for (const op of list) {
    if (op.op === "set")
      edits.setStat({
        name: required(op, "name"),
        newName: text(op.newName),
        value: optionalNumber(op.value),
        min: optionalNumber(op.min),
        max: optionalNumber(op.max),
        description: optionalString(op.description),
      });
    else if (op.op === "remove") edits.removeStat(required(op, "name"));
    else throw new Error("A stat op must be set or remove.");
  }
}

function applyItems(
  edits: ScenarioEdits,
  list: Array<Record<string, unknown>>,
) {
  const added: Array<{ id: string; name: string }> = [];
  for (const op of list) {
    if (op.op === "add") {
      const item = edits.addItem(
        required(op, "name"),
        optionalString(op.description),
      );
      added.push({ id: item.id, name: item.name });
    } else if (op.op === "update")
      edits.updateItem(required(op, "id"), {
        name: text(op.name),
        description: optionalString(op.description),
      });
    else if (op.op === "remove") edits.removeItem(required(op, "id"));
    else throw new Error("An item op must be add, update or remove.");
  }
  return added;
}

const COMPONENTS = [
  ["opening", PromptComponentType.OPENING],
  ["plot", PromptComponentType.PLOT],
  ["authorNote", PromptComponentType.AUTHOR_NOTE],
  ["aiInstructions", PromptComponentType.AI_INSTRUCTIONS],
] as const;

const CATEGORIES = Object.values(StorybookCategory);

function answersOf(value: unknown): Record<string, string> {
  const answers: Record<string, string> = {};
  if (value && typeof value === "object")
    for (const [key, answer] of Object.entries(value))
      if (typeof answer === "string") answers[key] = answer;
  return answers;
}

/** The questions a scenario still needs answered, as a start_tale result, or null when it can start. */
function questionsLeft(
  content: ScenarioContent[],
  answers: Record<string, string>,
) {
  const { questions, diagnostics } = analyzeScenarioQuestions(content);
  if (diagnostics.length)
    throw new Error(
      "This scenario's questions have mistakes; it has to be fixed in the editor before it can start.",
    );
  const missing = questions.filter((question) =>
    getScenarioAnswerError(question, answers[question.id]),
  );
  if (!missing.length) return null;
  return {
    started: false,
    questions: missing.map((question) => ({
      id: question.id,
      question: question.question,
      ...(question.options.length
        ? { options: question.options, onlyThese: question.mode === "choices" }
        : {}),
    })),
  };
}

const nameOf = (output: unknown) =>
  output && typeof output === "object" && "name" in output
    ? text((output as { name: unknown }).name)
    : undefined;

export function createScenarioTools(
  context: AssistantToolContext,
): AssistantTool[] {
  const record = (change: ScenarioChange | null) => {
    if (change) context.recordChanges?.([change]);
    return change;
  };
  const openTale = async (taleId: string, signal?: AbortSignal) => {
    const ui = requireUi(context);
    await withTaleWrites(signal, () => ui.openTale(taleId));
    return useTaleStore.getState().name;
  };

  return [
    defineTool({
      name: "edit_scenario",
      description:
        "Change a scenario, or create one. With the scenario editor open, this fills in its form, and the player saves it. Leave out what stays the same; an empty string clears opening, plot, author's note or AI instructions. Keep any ${...} questions the player wrote.",
      parameters: objectSchema({
        scenario: {
          type: "string",
          description:
            'Leave out for the scenario open in the editor. Otherwise a saved scenario\'s id, or "new" to create one in the library.',
        },
        name: { type: "string" },
        description: {
          type: "string",
          description: "Shown in the library, not sent to the narrator.",
        },
        mode: { type: "string", enum: ["story_teller", "game_master"] },
        opening: {
          type: "string",
          description: "The first passage of every tale started from it.",
        },
        plot: { type: "string" },
        authorNote: { type: "string" },
        aiInstructions: { type: "string" },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "update", "remove"] },
              id: {
                type: "string",
                description: "The card's id, for update and remove.",
              },
              title: { type: "string" },
              content: { type: "string" },
              category: { type: "string", enum: CATEGORIES },
              triggers: { type: "array", items: { type: "string" } },
              pinned: { type: "boolean" },
            },
            required: ["op"],
          },
        },
        stats: {
          type: "array",
          description: "Starting stats, used in Game Master mode.",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["set", "remove"] },
              name: { type: "string" },
              newName: { type: "string" },
              value: { type: "number" },
              min: { type: "number" },
              max: { type: "number" },
              description: { type: "string" },
            },
            required: ["op", "name"],
          },
        },
        items: {
          type: "array",
          description: "Starting inventory, used in Game Master mode.",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "update", "remove"] },
              id: {
                type: "string",
                description: "The item's id, for update and remove.",
              },
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["op"],
          },
        },
      }),
      run: async (args) => {
        const cards = opList(args.cards, "cards");
        const stats = opList(args.stats, "stats");
        const items = opList(args.items, "items");
        let addedCards: Array<{ id: string; title: string }> = [];
        let addedItems: Array<{ id: string; name: string }> = [];
        const change = record(
          await editScenario(text(args.scenario), (edits) => {
            const name = optionalString(args.name);
            if (name !== undefined) edits.setName(name);
            const description = optionalString(args.description);
            if (description !== undefined) edits.setDescription(description);
            if (args.mode !== undefined)
              edits.setMode(
                args.mode === "game_master"
                  ? GameMode.GM
                  : GameMode.STORY_TELLER,
              );
            for (const [key, type] of COMPONENTS) {
              const value = optionalString(args[key]);
              if (value !== undefined) edits.setComponent(type, value);
            }
            addedCards = applyCards(edits, cards);
            applyStats(edits, stats);
            addedItems = applyItems(edits, items);
          }),
        );
        if (!change) return { changed: false };
        return {
          changed: true,
          scenarioId: change.scenarioId || null,
          ...(change.target === "draft"
            ? { inEditor: true, note: "The player still has to save it." }
            : {}),
          ...(addedCards.length ? { addedCards } : {}),
          ...(addedItems.length ? { addedItems } : {}),
        };
      },
    }),
    defineTool({
      name: "scenario_from_tale",
      description:
        "Save a tale's setup (plot, notes, story cards, stats and inventory) as a new scenario in the library. Not for tales that were started from a scenario.",
      parameters: objectSchema({ ...taleIdProperty }),
      run: async (args) => {
        const change = record(await scenarioFromTale(taleIdFor(args, context)));
        return { scenarioId: change!.scenarioId, name: change!.after.name };
      },
    }),
    defineTool({
      name: "start_tale",
      description:
        "Start a new tale and open it on the play screen: from a saved scenario (scenarioId), a catalog scenario (catalogId), or Quickstart, where the helper model writes a tale from a few answers. If a scenario asks questions, the first call returns them: ask the player, then call again with their answers. private keeps the tale on this device.",
      parameters: objectSchema({
        scenarioId: { type: "string" },
        catalogId: { type: "string" },
        quickstart: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["story_teller", "game_master"] },
            world: { type: "string" },
            character: {
              type: "string",
              description: "The player character's name.",
            },
            archetype: { type: "string", description: "Who the character is." },
            tone: { type: "string" },
            details: { type: "string" },
          },
          required: ["world", "character", "archetype"],
        },
        answers: {
          type: "object",
          description: "Answers keyed by question id.",
          additionalProperties: { type: "string" },
        },
        private: {
          type: "boolean",
          description:
            "Keep the tale on this device instead of syncing it. Without cloud sync every tale stays on the device anyway.",
        },
      }),
      detail: (args) =>
        args.quickstart
          ? "quickstart"
          : text(args.catalogId)
            ? "catalog"
            : undefined,
      run: async (args, signal) => {
        const syncPolicy =
          args.private === true && (await canSyncNewTales())
            ? "private"
            : undefined;
        const answers = answersOf(args.answers);
        const open = async (taleId: string) => {
          try {
            return {
              started: true,
              taleId,
              name: await openTale(taleId, signal),
            };
          } catch (error) {
            throw new Error(
              `The tale was started (id ${taleId}) but couldn't be opened: ${errorMessage(error)}`,
            );
          }
        };

        if (args.quickstart && typeof args.quickstart === "object") {
          const quick = args.quickstart as Record<string, unknown>;
          if (
            !isModelRoleConfigured(
              useSettingsStore.getState().modelRoles.utility,
            )
          )
            throw new Error(
              "Quickstart needs the helper model, which isn't set up. The player sets it in Settings › AI Setup.",
            );
          const world = text(quick.world);
          const characterName = text(quick.character);
          const archetype = text(quick.archetype);
          if (!world || !characterName || !archetype)
            throw new Error("quickstart needs world, character and archetype.");
          const taleId = await createQuickstartTale(
            {
              gameMode:
                quick.mode === "game_master"
                  ? GameMode.GM
                  : GameMode.STORY_TELLER,
              world,
              characterName,
              archetype,
              tone: text(quick.tone),
              extraDetails: text(quick.details),
            },
            { private: syncPolicy === "private", signal },
          );
          return open(taleId);
        }

        const catalogId = text(args.catalogId);
        if (catalogId) {
          const transport = await catalogTransport();
          const detail = await getCatalogScenario(transport, catalogId);
          const asked = questionsLeft(detail.package.scenario.content, answers);
          if (asked) return asked;
          try {
            return open(
              await startCatalogScenario(transport, catalogId, {
                answers,
                syncPolicy,
                scenarioSnapshot: detail,
              }),
            );
          } catch (error) {
            throw new Error(
              `${errorMessage(error)}. If the scenario changed meanwhile, look at it again with catalog get.`,
            );
          }
        }

        const scenarioId = text(args.scenarioId);
        const scenario = scenarioId ? await getScenarioById(scenarioId) : null;
        if (!scenario)
          throw new Error(
            scenarioId
              ? "No saved scenario has that id."
              : "Give scenarioId, catalogId or quickstart.",
          );
        const asked = questionsLeft(scenario.content, answers);
        if (asked) return asked;
        return open(
          await initTaleFromScenario(scenario.id, { answers, syncPolicy }),
        );
      },
      outcome: nameOf,
    }),
  ];
}
