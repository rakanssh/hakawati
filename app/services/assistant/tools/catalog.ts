import { currentCatalogTransports } from "@/services/catalog-client";
import {
  canUseScenarioCatalog,
  fetchCatalogCapabilities,
  getCatalogScenario,
  listCatalogScenarios,
  listCatalogTags,
  listOwnedCatalogScenarios,
  unpublishCatalogScenario,
  type CatalogTransport,
} from "@/services/catalog.service";
import {
  CATALOG_SORTS,
  type CatalogScenarioRecord,
  type CatalogSort,
} from "@/types/catalog.type";
import { analyzeScenarioQuestions } from "@/lib/scenario-questions";
import { clip } from "../context";
import {
  ask,
  CANCELLED,
  defineTool,
  integer,
  modeName,
  objectSchema,
  strings,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { errorMessage } from "@/lib/errors";

const ACTIONS = ["search", "get", "tags", "published", "unpublish"] as const;

const CAPABILITIES_TTL = 5 * 60_000;
const checked = new Map<string, { at: number; ok: Promise<boolean> }>();

function hasCatalog(baseUrl: string, transport: CatalogTransport) {
  const cached = checked.get(baseUrl);
  if (cached && Date.now() - cached.at < CAPABILITIES_TTL) return cached.ok;
  const ok = fetchCatalogCapabilities(transport).then(canUseScenarioCatalog);
  checked.set(baseUrl, { at: Date.now(), ok });
  ok.catch(() => checked.delete(baseUrl));
  return ok;
}

/** A transport to the public catalog, once the server says it has one. */
export async function catalogTransport(
  signedIn = false,
): Promise<CatalogTransport> {
  const transports = currentCatalogTransports();
  const transport = signedIn
    ? transports.authTransport
    : transports.readTransport;
  if (!transports.publicTransport)
    throw new Error(
      "No cloud server is set up, so the catalog isn't available.",
    );
  if (!transport)
    throw new Error(
      "The player isn't signed in. They sign in from Settings › Account & Sync.",
    );
  try {
    if (!(await hasCatalog(transports.baseUrl, transport)))
      throw new Error("This server has no scenario catalog.");
  } catch (error) {
    throw new Error(`The catalog can't be reached: ${errorMessage(error)}`);
  }
  return transport;
}

const summary = (record: CatalogScenarioRecord) => ({
  id: record.id,
  title: record.title,
  summary: clip(record.summary, 240),
  tags: record.tags,
  author: record.author.displayName,
  starts: record.startCount,
});

export function createCatalogTools(
  context: AssistantToolContext,
): AssistantTool[] {
  return [
    defineTool({
      name: "catalog",
      description:
        "The public scenario catalog: search it, read one scenario, list tags, list the player's own published scenarios, or unpublish one (the player confirms with buttons). Start a catalog scenario with start_tale and catalogId. Publishing is done by the player.",
      parameters: objectSchema(
        {
          action: { type: "string", enum: [...ACTIONS] },
          query: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          sort: { type: "string", enum: [...CATALOG_SORTS] },
          id: { type: "string", description: "A catalog scenario's id." },
          limit: { type: "integer", description: "Up to 30. Default 10." },
        },
        ["action"],
      ),
      detail: (args) => text(args.query),
      run: async (args) => {
        const limit = integer(args.limit, 1, 30, 10);
        const tags = strings(args.tags);
        switch (args.action) {
          case "search": {
            const sort = CATALOG_SORTS.includes(args.sort as CatalogSort)
              ? (args.sort as CatalogSort)
              : undefined;
            const page = await listCatalogScenarios(await catalogTransport(), {
              q: text(args.query),
              tag: tags,
              sort,
              limit,
            });
            return { scenarios: page.items.map(summary) };
          }
          case "get": {
            const id = text(args.id);
            if (!id) throw new Error("get needs id.");
            const detail = await getCatalogScenario(
              await catalogTransport(),
              id,
            );
            const { scenario } = detail.package;
            const { questions } = analyzeScenarioQuestions(scenario.content);
            return {
              ...summary(detail),
              mode: modeName(scenario.initialGameMode),
              description: clip(scenario.description, 1200),
              ...(questions.length
                ? { asks: questions.map((q) => q.question) }
                : {}),
            };
          }
          case "tags": {
            const page = await listCatalogTags(await catalogTransport(), {
              q: text(args.query),
              limit,
            });
            return { tags: page.items };
          }
          case "published": {
            const page = await listOwnedCatalogScenarios(
              await catalogTransport(true),
              { limit },
            );
            return {
              scenarios: page.items.map((item) => ({
                ...summary(item),
                status: item.status,
              })),
            };
          }
          case "unpublish": {
            const id = text(args.id);
            if (!id) throw new Error("unpublish needs id.");
            const transport = await catalogTransport(true);
            const owned = (
              await listOwnedCatalogScenarios(transport, { limit: 100 })
            ).items.find((item) => item.id === id);
            if (!owned)
              throw new Error(
                "That isn't one of the player's published scenarios.",
              );
            if (!(await ask(context, "unpublish", [owned.title])))
              return CANCELLED;
            await unpublishCatalogScenario(transport, id);
            return { unpublished: owned.title };
          }
          default:
            throw new Error(`action must be one of: ${ACTIONS.join(", ")}.`);
        }
      },
    }),
  ];
}
