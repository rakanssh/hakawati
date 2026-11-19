import { copyTextToClipboard, readTextFromClipboard } from "@/lib/clipboard";
import type { LibraryTaleItem } from "@/lib/tale-library";
import { getTales } from "@/repositories/tale.repository";
import {
  deserializeScenarioExport,
  getScenarioById,
  removeScenario,
  serializeScenarioExport,
} from "@/services/scenario.service";
import { notifySyncChanged } from "@/services/sync-wakeup";
import {
  currentSyncSession,
  deleteLibraryTaleItem,
  loadTaleLibrary,
  removeLibraryTaleItemFromCloud,
  resolveTaleConflict,
  syncLibraryTaleItem,
} from "@/services/tale-library";
import { deleteTaleById } from "@/services/tale.service";
import { useScenarioDraftStore } from "@/store/useScenarioDraftStore";
import { useTaleStore } from "@/store/useTaleStore";
import type { AssistantConfirmAction } from "@/types/assistant.type";
import { describeRoute } from "../context";
import { withTaleWrites } from "../tale-edits";
import {
  defineTool,
  objectSchema,
  requireUi,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { errorMessage } from "./read";

const MAX_IDS = 20;
const ACTIONS = [
  "delete",
  "sync",
  "stop_syncing",
  "resolve_conflict",
  "export",
  "import",
] as const;

const itemId = (item: LibraryTaleItem) =>
  item.source === "local" ? item.localTale.id : item.remoteTale.id;
const itemName = (item: LibraryTaleItem) =>
  item.source === "local" ? item.localTale.name : item.remoteTale.title;

function idsOf(args: Record<string, unknown>): string[] {
  const ids = Array.isArray(args.ids)
    ? [
        ...new Set(
          args.ids.filter((id): id is string => typeof id === "string"),
        ),
      ]
    : [];
  if (!ids.length) throw new Error("Give ids from list_library.");
  if (ids.length > MAX_IDS) throw new Error(`At most ${MAX_IDS} at a time.`);
  return ids;
}

async function libraryItems(ids: string[]) {
  const session = currentSyncSession();
  const { data } = await getTales(1, 500);
  const library = await loadTaleLibrary(session, data);
  const items = ids.map((id) => {
    const item = library.items.find((entry) => itemId(entry) === id);
    if (!item) throw new Error(`No tale has id ${id}.`);
    return item;
  });
  return { session, syncActive: library.syncActive, items };
}

export function createLibraryTools(
  context: AssistantToolContext,
): AssistantTool[] {
  const ask = async (action: AssistantConfirmAction, names: string[]) => {
    if (!context.confirm)
      throw new Error("The player can't be asked from here.");
    return context.confirm({ action, names });
  };
  const cancelled = { done: false, cancelled: true };

  const forEach = async <T>(
    items: T[],
    run: (item: T) => Promise<void>,
    nameOf: (item: T) => string,
  ) => {
    const done: string[] = [];
    const failed: string[] = [];
    for (const item of items) {
      try {
        await run(item);
        done.push(nameOf(item));
      } catch (error) {
        failed.push(`${nameOf(item)}: ${errorMessage(error)}`);
      }
    }
    if (failed.length && !done.length) throw new Error(failed.join(" "));
    return { done, ...(failed.length ? { failed } : {}) };
  };

  const deleteTales = async (ids: string[], signal?: AbortSignal) => {
    const ui = requireUi(context);
    const { session, syncActive, items } = await libraryItems(ids);
    if (!(await ask("delete_tales", items.map(itemName)))) return cancelled;
    const openId = useTaleStore.getState().id;
    if (items.some((item) => itemId(item) === openId)) {
      await withTaleWrites(signal, async () => {
        if (describeRoute(context.getPathname()).page === "play")
          await ui.navigate("/tales");
      });
    }
    const result = await forEach(
      items,
      (item) =>
        deleteLibraryTaleItem(item, {
          session,
          syncActive,
          deleteLocal: async (taleId) => {
            await deleteTaleById(taleId);
            ui.forgetTale(taleId);
          },
        }),
      itemName,
    );
    notifySyncChanged();
    return { deleted: result.done, ...result };
  };

  const deleteScenarios = async (ids: string[]) => {
    const ui = requireUi(context);
    const scenarios = await Promise.all(
      ids.map(async (id) => {
        const scenario = await getScenarioById(id);
        if (!scenario) throw new Error(`No scenario has id ${id}.`);
        return scenario;
      }),
    );
    if (
      !(await ask(
        "delete_scenarios",
        scenarios.map((s) => s.name),
      ))
    )
      return cancelled;
    const route = describeRoute(context.getPathname());
    if (route.scenarioId && ids.includes(route.scenarioId))
      await ui.navigate("/scenarios", { search: { tab: "local" } });
    const result = await forEach(
      scenarios,
      (scenario) => removeScenario(scenario.id),
      (scenario) => scenario.name,
    );
    useScenarioDraftStore.getState().bumpLibrary();
    return {
      deleted: result.done,
      ...result,
      note: "Copies already published to the catalog stay there.",
    };
  };

  const needSync = (syncActive: boolean) => {
    if (!syncActive)
      throw new Error(
        "Cloud sync is off or signed out. The player turns it on in Settings › Account & Sync.",
      );
  };

  const syncTales = async (ids: string[]) => {
    const { session, syncActive, items } = await libraryItems(ids);
    needSync(syncActive);
    const result = await forEach(
      items,
      async (item) => {
        if (!(await syncLibraryTaleItem(item, { session, syncActive })))
          throw new Error("already synced, or only in the cloud");
      },
      itemName,
    );
    notifySyncChanged();
    return { syncing: result.done, ...result };
  };

  const stopSyncing = async (ids: string[]) => {
    const { session, syncActive, items } = await libraryItems(ids);
    needSync(syncActive);
    if (!(await ask("remove_from_cloud", items.map(itemName))))
      return cancelled;
    const result = await forEach(
      items,
      (item) => removeLibraryTaleItemFromCloud(item, { session, syncActive }),
      itemName,
    );
    notifySyncChanged();
    return {
      removedFromCloud: result.done,
      ...result,
      note: "They stay on this device as private tales.",
    };
  };

  const resolveConflict = async (ids: string[], keep: string | undefined) => {
    if (ids.length !== 1) throw new Error("Settle one conflict at a time.");
    const library = await libraryItems(ids);
    needSync(library.syncActive);
    const [item] = library.items;
    if (item.source !== "local" || item.sync?.status !== "conflict")
      throw new Error("That tale has no sync conflict.");
    const choice =
      keep === "local"
        ? "keep-local"
        : keep === "cloud"
          ? "keep-remote"
          : keep === "both"
            ? "keep-both"
            : undefined;
    if (!choice) throw new Error("keep must be local, cloud or both.");
    if (
      choice !== "keep-both" &&
      !(await ask(choice === "keep-local" ? "keep_local" : "keep_cloud", [
        itemName(item),
      ]))
    )
      return cancelled;
    const taleId = await resolveTaleConflict(item, choice, library.session);
    notifySyncChanged();
    return { resolved: itemName(item), kept: keep, taleId };
  };

  return [
    defineTool({
      name: "library",
      description:
        "Manage the player's library. delete removes tales or scenarios for good; sync and stop_syncing move tales into or out of the cloud; resolve_conflict settles a tale's sync conflict; export copies a scenario to the clipboard as JSON; import opens a copied scenario in the editor. Deleting, stop_syncing and overwriting a conflict ask the player with buttons first, so don't ask in text.",
      parameters: objectSchema(
        {
          action: { type: "string", enum: [...ACTIONS] },
          kind: { type: "string", enum: ["tale", "scenario"] },
          ids: {
            type: "array",
            items: { type: "string" },
            description: `Up to ${MAX_IDS} ids from list_library.`,
          },
          keep: {
            type: "string",
            enum: ["local", "cloud", "both"],
            description: "resolve_conflict: which copy to keep.",
          },
        },
        ["action"],
      ),
      detail: (args) => text(args.kind),
      run: async (args, signal) => {
        switch (args.action) {
          case "delete":
            return args.kind === "scenario"
              ? deleteScenarios(idsOf(args))
              : args.kind === "tale"
                ? deleteTales(idsOf(args), signal)
                : Promise.reject(
                    new Error("delete needs kind: tale or scenario."),
                  );
          case "sync":
            return syncTales(idsOf(args));
          case "stop_syncing":
            return stopSyncing(idsOf(args));
          case "resolve_conflict":
            return resolveConflict(idsOf(args), text(args.keep));
          case "export": {
            const [id] = idsOf(args);
            const scenario = await getScenarioById(id);
            if (!scenario) throw new Error("No scenario has that id.");
            await copyTextToClipboard(serializeScenarioExport(scenario));
            return { copied: scenario.name };
          }
          case "import": {
            const ui = requireUi(context);
            const scenario = deserializeScenarioExport(
              await readTextFromClipboard(),
            );
            await ui.navigate("/scenarios/new", {
              state: { importedScenario: scenario },
            });
            return {
              opened: scenario.name,
              note: "It's in the editor; the player creates it from there.",
            };
          }
          default:
            throw new Error(`action must be one of: ${ACTIONS.join(", ")}.`);
        }
      },
    }),
  ];
}
