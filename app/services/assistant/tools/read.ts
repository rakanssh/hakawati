import { scenarioContentToEditorFields } from "@/lib/scenario-content";
import { getScenario, getScenarios } from "@/repositories/scenario.repository";
import {
  findLogEntries,
  getLogCount,
  getLogEntries,
  getTalePlayLoad,
  getTales,
  searchLogEntries,
} from "@/repositories/tale.repository";
import { errorMessage } from "@/lib/errors";
import { listScenarioPublishLinks } from "@/repositories/scenario-publish-link.repository";
import { currentSyncSession, loadTaleLibrary } from "@/services/tale-library";
import { useScenarioDraftStore } from "@/store/useScenarioDraftStore";
import { useTaleStore } from "@/store/useTaleStore";
import { PromptComponentType } from "@/types";
import {
  clip,
  describePassage,
  describeTaleSetup,
  openTaleId,
} from "../context";
import {
  defineTool,
  integer,
  modeName,
  objectSchema,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";

export function taleIdFor(
  args: Record<string, unknown>,
  context: AssistantToolContext,
): string {
  const taleId = text(args.taleId) ?? openTaleId(context.getPathname());
  if (!taleId)
    throw new Error(
      "No tale is open. Pass taleId; list_library finds the player's tales.",
    );
  return taleId;
}

const matches = (query: string | undefined, ...fields: string[]) =>
  !query ||
  fields.some((field) => field.toLowerCase().includes(query.toLowerCase()));

function snippet(source: string, query: string): string {
  const first = query.toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
  const at = Math.max(0, source.toLowerCase().indexOf(first));
  const start = Math.max(0, at - 160);
  const end = Math.min(source.length, at + first.length + 160);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

export const taleIdProperty = {
  taleId: {
    type: "string",
    description: "Tale id. Leave out for the tale open on the play screen.",
  },
};

export function createReadTools(
  context: AssistantToolContext,
): AssistantTool[] {
  return [
    defineTool({
      name: "list_library",
      description:
        "List the player's tales or scenarios, most recently changed first, with sync and publishing status. Cloud-only tales are listed apart.",
      parameters: objectSchema(
        {
          kind: { type: "string", enum: ["tales", "scenarios"] },
          query: {
            type: "string",
            description: "Only items whose name or description contains this.",
          },
          limit: { type: "integer", description: "Up to 50. Default 20." },
        },
        ["kind"],
      ),
      detail: (args) => text(args.kind),
      run: async (args) => {
        const query = text(args.query);
        const limit = integer(args.limit, 1, 50, 20);
        if (args.kind === "scenarios") {
          const { data, total } = await getScenarios(1, limit, query);
          const published = new Set(
            (await listScenarioPublishLinks().catch(() => [])).map(
              (link) => link.localScenarioId,
            ),
          );
          return {
            total,
            scenarios: data.map((s) => ({
              id: s.id,
              name: s.name,
              description: clip(s.description, 240),
              mode: modeName(s.initialGameMode),
              ...(published.has(s.id) ? { published: true } : {}),
            })),
          };
        }
        if (args.kind !== "tales")
          throw new Error("kind must be tales or scenarios.");
        const { data, total } = await getTales(1, limit, query);
        const library = await loadTaleLibrary(currentSyncSession(), data).catch(
          () => null,
        );
        const sync = new Map(
          (library?.items ?? []).flatMap((item) =>
            item.source === "local" && item.sync
              ? [[item.localTale.id, item.sync.status] as const]
              : [],
          ),
        );
        const openId = useTaleStore.getState().id;
        const cloudOnly = (library?.items ?? []).flatMap((item) =>
          item.source === "remote" &&
          matches(
            query,
            item.remoteTale.title,
            item.remoteTale.description ?? "",
          )
            ? [
                {
                  id: item.remoteTale.id,
                  name: item.remoteTale.title,
                  description: clip(item.remoteTale.description ?? "", 240),
                  cloudOnly: true,
                },
              ]
            : [],
        );
        return {
          total,
          ...(library?.syncActive ? { syncOn: true } : {}),
          ...(library?.cloudError
            ? { cloudError: errorMessage(library.cloudError) }
            : {}),
          tales: data.map((t) => {
            const status = sync.get(t.id);
            return {
              id: t.id,
              name: t.name,
              description: clip(t.description, 240),
              passages: t.logCount,
              lastPlayed: new Date(t.updatedAt).toISOString().slice(0, 10),
              ...(t.scenarioHead ? { scenario: t.scenarioHead.name } : {}),
              ...(status
                ? { sync: status === "idle" ? "synced" : status }
                : library?.syncActive
                  ? { sync: "not synced" }
                  : {}),
              ...(t.id === openId ? { open: true } : {}),
            };
          }),
          ...(cloudOnly.length ? { cloudOnly: cloudOnly.slice(0, limit) } : {}),
        };
      },
    }),
    defineTool({
      name: "get_tale",
      description:
        "A tale's setup: name, description, mode, plot, author's note, AI instructions, story cards, and in Game Master mode its stats and inventory.",
      parameters: objectSchema(taleIdProperty),
      run: async (args) => {
        const taleId = taleIdFor(args, context);
        if (taleId === openTaleId(context.getPathname())) {
          const tale = useTaleStore.getState();
          return {
            id: taleId,
            open: true,
            passages: tale.totalLogCount,
            ...describeTaleSetup(tale),
          };
        }
        const tale = await getTalePlayLoad(taleId, { logLimit: 0 });
        if (!tale) throw new Error("No tale has that id.");
        return {
          id: taleId,
          open: false,
          passages: tale.totalLogCount,
          ...(tale.scenarioId ? { scenarioId: tale.scenarioId } : {}),
          ...describeTaleSetup(tale),
        };
      },
    }),
    defineTool({
      name: "read_log",
      description:
        "Read passages of a tale's story in order. Gives the latest passages unless you pass around or start.",
      parameters: objectSchema({
        ...taleIdProperty,
        around: {
          type: "string",
          description: "A passage id to read around.",
        },
        start: {
          type: "integer",
          description: "Index of the first passage to read, from 0.",
        },
        count: { type: "integer", description: "Up to 40. Default 20." },
      }),
      run: async (args) => {
        const taleId = taleIdFor(args, context);
        const count = integer(args.count, 1, 40, 20);
        const total = await getLogCount(taleId);
        let start = Math.max(0, total - count);
        const around = text(args.around);
        if (around) {
          const [found] = await findLogEntries(taleId, [around]);
          if (!found) throw new Error("No passage has that id.");
          start = Math.max(0, found.index - Math.floor(count / 2));
        } else if (args.start !== undefined) {
          start = integer(args.start, 0, Math.max(0, total - 1), 0);
        }
        const entries = await getLogEntries(taleId, start, count);
        return {
          taleId,
          total,
          passages: entries.map((entry, offset) =>
            describePassage(entry, start + offset),
          ),
        };
      },
    }),
    defineTool({
      name: "search_log",
      description:
        "Find passages in a tale's story that contain every word of a query, newest first.",
      parameters: objectSchema(
        {
          ...taleIdProperty,
          query: { type: "string" },
          limit: { type: "integer", description: "Up to 20. Default 10." },
        },
        ["query"],
      ),
      detail: (args) => text(args.query),
      run: async (args) => {
        const taleId = taleIdFor(args, context);
        const query = text(args.query);
        if (!query) throw new Error("query is empty.");
        const found = await searchLogEntries(
          taleId,
          query,
          integer(args.limit, 1, 20, 10),
        );
        return {
          taleId,
          matches: found.map(({ entry, index }) => ({
            ...describePassage(entry, index),
            text: snippet(entry.text, query),
          })),
        };
      },
    }),
    defineTool({
      name: "get_scenario",
      description:
        "A scenario in full: opening, plot, author's note, AI instructions, story cards, stats and inventory, with the ids edit_scenario needs.",
      parameters: objectSchema({
        scenarioId: {
          type: "string",
          description:
            "Leave out for the scenario open in the editor, with its unsaved changes.",
        },
      }),
      run: async (args) => {
        const scenarioId = text(args.scenarioId);
        const open = useScenarioDraftStore.getState().draft?.read();
        const inEditor = Boolean(
          open && (!scenarioId || scenarioId === open.id),
        );
        const scenario = inEditor
          ? open
          : scenarioId
            ? await getScenario(scenarioId)
            : null;
        if (!scenario)
          throw new Error(
            scenarioId
              ? "No saved scenario has that id."
              : "No scenario is open in the editor. Pass scenarioId.",
          );
        const fields = scenarioContentToEditorFields(scenario.content);
        const component = (type: PromptComponentType) =>
          fields.components.find((c) => c.type === type)?.content ?? "";
        return {
          id: scenario.id || null,
          ...(inEditor ? { inEditor: true } : {}),
          name: scenario.name,
          description: scenario.description,
          mode: modeName(scenario.initialGameMode),
          opening: component(PromptComponentType.OPENING),
          plot: component(PromptComponentType.PLOT),
          authorNote: component(PromptComponentType.AUTHOR_NOTE),
          aiInstructions: clip(
            component(PromptComponentType.AI_INSTRUCTIONS),
            4000,
          ),
          storyCards: fields.initialStoryCards.map((card) => ({
            id: card.id,
            title: card.title,
            category: card.category,
            triggers: card.triggers,
            pinned: card.isPinned,
            content: card.content,
          })),
          stats: fields.initialStats.map((stat) => ({
            name: stat.name,
            value: stat.value,
            range: stat.range,
            ...(stat.description ? { description: stat.description } : {}),
          })),
          inventory: fields.initialInventory.map((item) => ({
            id: item.id,
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
          })),
        };
      },
    }),
  ];
}
