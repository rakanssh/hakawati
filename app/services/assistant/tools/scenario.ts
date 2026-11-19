import {
  analyzeScenarioQuestions,
  getScenarioAnswerError,
} from "@/lib/scenario-questions";
import {
  getScenarioById,
  initTaleFromScenario,
} from "@/services/scenario.service";
import { useTaleStore } from "@/store/useTaleStore";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
  type StoryCardContent,
} from "@/types/context.type";
import type { ScenarioChange } from "@/types/assistant.type";
import type { ScenarioEdits } from "../scenario-changes";
import { editScenario, scenarioFromTale } from "../scenario-edits";
import { withTaleWrites } from "../tale-edits";
import {
  defineTool,
  objectSchema,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { taleIdFor, taleIdProperty } from "./read";

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
    if (!context.openTale) throw new Error("Tales can't be opened from here.");
    await withTaleWrites(signal, () => context.openTale!(taleId));
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
        "Start a new tale from a saved scenario and open it on the play screen. If the scenario asks the player questions, the first call returns them: ask the player, then call again with their answers.",
      parameters: objectSchema(
        {
          scenarioId: { type: "string" },
          answers: {
            type: "object",
            description: "Answers keyed by question id.",
            additionalProperties: { type: "string" },
          },
        },
        ["scenarioId"],
      ),
      run: async (args, signal) => {
        const scenarioId = text(args.scenarioId);
        const scenario = scenarioId ? await getScenarioById(scenarioId) : null;
        if (!scenario) throw new Error("No saved scenario has that id.");
        const { questions, diagnostics } = analyzeScenarioQuestions(
          scenario.content,
        );
        if (diagnostics.length)
          throw new Error(
            "This scenario's questions have mistakes; it has to be fixed in the editor before it can start.",
          );
        const given =
          args.answers && typeof args.answers === "object"
            ? (args.answers as Record<string, unknown>)
            : {};
        const answers: Record<string, string> = {};
        for (const [key, value] of Object.entries(given))
          if (typeof value === "string") answers[key] = value;
        const missing = questions.filter((question) =>
          getScenarioAnswerError(question, answers[question.id]),
        );
        if (missing.length)
          return {
            started: false,
            questions: missing.map((question) => ({
              id: question.id,
              question: question.question,
              ...(question.options.length
                ? {
                    options: question.options,
                    onlyThese: question.mode === "choices",
                  }
                : {}),
            })),
          };
        const taleId = await initTaleFromScenario(scenario.id, { answers });
        try {
          return {
            started: true,
            taleId,
            name: await openTale(taleId, signal),
          };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(
            `The tale was started (id ${taleId}) but couldn't be opened: ${reason}`,
          );
        }
      },
      outcome: nameOf,
    }),
    defineTool({
      name: "open_tale",
      description: "Open one of the player's tales on the play screen.",
      parameters: objectSchema({ taleId: { type: "string" } }, ["taleId"]),
      run: async (args, signal) => {
        const taleId = text(args.taleId);
        if (!taleId) throw new Error("open_tale needs taleId.");
        return { opened: taleId, name: await openTale(taleId, signal) };
      },
      outcome: nameOf,
    }),
  ];
}
