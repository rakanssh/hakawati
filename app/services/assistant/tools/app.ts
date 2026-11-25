import { getScenarioById } from "@/services/scenario.service";
import {
  currentSyncSession,
  importCloudTale,
} from "@/services/tale-library.service";
import { SETTINGS_TABS } from "@/store/useSettingsModalStore";
import { STORY_PANEL_TABS } from "@/store/useStoryPanelStore";
import { useTaleStore } from "@/store/useTaleStore";
import { isUpdaterAvailable, useUpdateStore } from "@/store/useUpdateStore";
import { taleExists } from "@/repositories/tale.repository";
import type { SettingChange } from "@/types/assistant.type";
import { changeSetting } from "../app-changes";
import { APP_SETTINGS, SETTING_KEYS } from "../app-settings";
import { describeRoute, workspaceContext } from "../context";
import { changedParts } from "../scenario-changes";
import { openDraft, withoutThumbnail } from "../scenario-edits";
import {
  defineTool,
  objectSchema,
  oneOf,
  requireUi,
  text,
  type AssistantTool,
  type AssistantToolContext,
} from "./define";
import { errorMessage } from "@/lib/errors";
import { openTaleNamed, outputName } from "./open-tale";

const PAGES = [
  "home",
  "tales",
  "scenarios",
  "discover",
  "published",
  "scenario",
  "scenario_editor",
  "new_scenario",
  "catalog_scenario",
  "quickstart",
  "play",
] as const;

type Page = (typeof PAGES)[number];

const PANEL_TABS = STORY_PANEL_TABS.filter((tab) => tab !== "hakawati");

async function hasUnsavedScenario(): Promise<boolean> {
  const draft = openDraft()?.read();
  if (!draft) return false;
  if (!draft.id)
    return Boolean(
      draft.content.length ||
        draft.description.trim() ||
        !["", "untitled scenario"].includes(draft.name.trim().toLowerCase()),
    );
  const stored = await getScenarioById(draft.id);
  return (
    !stored ||
    changedParts(withoutThumbnail(stored), withoutThumbnail(draft)).length > 0
  );
}

function pathFor(
  page: Page,
  id: string | undefined,
  query: string | undefined,
): { to: string; search?: Record<string, unknown> } {
  const need = () => {
    if (!id) throw new Error(`show ${page} needs id.`);
    return encodeURIComponent(id);
  };
  switch (page) {
    case "home":
      return { to: "/" };
    case "tales":
      return { to: "/tales" };
    case "scenarios":
    case "discover":
      return {
        to: "/scenarios",
        search: {
          tab: page === "scenarios" ? "local" : "discover",
          ...(query ? { q: query } : {}),
        },
      };
    case "published":
      return { to: "/scenarios", search: { tab: "published" } };
    case "scenario":
      return { to: `/scenarios/${need()}` };
    case "scenario_editor":
      return { to: `/scenarios/${need()}/edit` };
    case "new_scenario":
      return { to: "/scenarios/new" };
    case "catalog_scenario":
      return { to: `/scenarios/catalog/${need()}` };
    case "quickstart":
      return { to: "/quickstart" };
    case "play":
      return { to: "/play" };
  }
}

function shownValue(key: string) {
  const { read, builtIn } = APP_SETTINGS[key];
  const value = read();
  if (builtIn === undefined) return { value };
  const prompt = value as { custom: boolean; text: string | null };
  return prompt.custom && prompt.text
    ? { value: prompt.text }
    : { value: builtIn, builtIn: true };
}

export function createAppTools(context: AssistantToolContext): AssistantTool[] {
  const record = (changes: SettingChange[]) => {
    if (changes.length) context.recordChanges?.(changes);
  };

  return [
    defineTool({
      name: "show",
      description:
        "Show the player a screen: a page, a tale on the play screen, a Settings tab (cloud-sync is Account & Sync, maintenance is Updates), or a tab of the play screen's side panel. Use it to open the place where the player does something you can't. After a page, it returns the new context.",
      parameters: objectSchema({
        page: { type: "string", enum: [...PAGES] },
        id: {
          type: "string",
          description:
            "The tale for play (a cloud-only tale is downloaded first), or the scenario for scenario, scenario_editor and catalog_scenario.",
        },
        query: {
          type: "string",
          description: "A search for scenarios or discover.",
        },
        settings: { type: "string", enum: [...SETTINGS_TABS] },
        panel: {
          type: "string",
          enum: PANEL_TABS,
          description: "A side-panel tab; only on the play screen.",
        },
      }),
      detail: (args) =>
        text(args.settings)
          ? `settings:${args.settings}`
          : text(args.panel)
            ? `panel:${args.panel}`
            : text(args.page)
              ? `page:${args.page}`
              : undefined,
      run: async (args, signal) => {
        const ui = requireUi(context);
        const page =
          args.page === undefined ? undefined : oneOf(args.page, PAGES, "page");
        const id = text(args.id);
        const shown: string[] = [];
        let name: string | undefined;
        if (page) {
          const route = describeRoute(context.getPathname()).page;
          if (
            (route === "scenario_editor" || route === "new_scenario") &&
            (await hasUnsavedScenario())
          )
            throw new Error(
              "The scenario editor has changes that aren't saved. Ask the player to save or discard them first.",
            );
          if (page === "play" && id) {
            const taleId = (await taleExists(id))
              ? id
              : await importCloudTale(currentSyncSession(), id).catch(
                  (error) => {
                    throw new Error(
                      `No tale has that id here or in the cloud (${errorMessage(error)}).`,
                    );
                  },
                );
            name = await openTaleNamed(context, taleId, signal);
            shown.push(`tale ${name}`);
          } else {
            if (page === "play" && !useTaleStore.getState().id)
              throw new Error("No tale is loaded. Give the tale's id.");
            const { to, search } = pathFor(page, id, text(args.query));
            await ui.navigate(to, search ? { search } : undefined);
            shown.push(page);
          }
        }
        const panel =
          args.panel === undefined
            ? undefined
            : oneOf(args.panel, PANEL_TABS, "panel");
        if (panel) {
          if (describeRoute(context.getPathname()).page !== "play")
            throw new Error(
              "Side-panel tabs are only on the play screen. Show play first.",
            );
          ui.showPanelTab(panel);
          shown.push(`${panel} tab`);
        }
        const settings =
          args.settings === undefined
            ? undefined
            : oneOf(args.settings, SETTINGS_TABS, "settings");
        if (settings) {
          ui.showSettings(settings);
          shown.push(`${settings} settings`);
        }
        if (!shown.length)
          throw new Error("Say what to show: page, settings or panel.");
        return {
          shown,
          ...(name ? { name } : {}),
          ...(page ? { context: workspaceContext(context.getPathname()) } : {}),
        };
      },
      outcome: outputName,
    }),
    defineTool({
      name: "settings",
      description:
        "Read or change the app's settings: appearance (theme, text size, font, language…), generation (temperature, context…), prompts, and reading narration aloud. get lists every setting with what it accepts. Changes apply at once and can be undone.",
      parameters: objectSchema(
        {
          action: { type: "string", enum: ["get", "set", "check_updates"] },
          keys: {
            type: "array",
            items: { type: "string", enum: SETTING_KEYS },
            description: "get: only these settings.",
          },
          values: {
            type: "object",
            description:
              "set: new values by key. null puts a setting back to its default.",
          },
        },
        ["action"],
      ),
      run: async (args) => {
        if (args.action === "get") {
          const wanted = Array.isArray(args.keys)
            ? args.keys.filter((key): key is string => key in APP_SETTINGS)
            : SETTING_KEYS;
          return Object.fromEntries(
            wanted.map((key) => [
              key,
              {
                ...shownValue(key),
                accepts: APP_SETTINGS[key].accepts,
                tab: APP_SETTINGS[key].tab,
              },
            ]),
          );
        }
        if (args.action === "set") {
          if (
            !args.values ||
            typeof args.values !== "object" ||
            Array.isArray(args.values)
          )
            throw new Error("set needs values, an object of settings.");
          const changes: SettingChange[] = [];
          const problems: string[] = [];
          for (const [key, value] of Object.entries(args.values)) {
            try {
              const change = changeSetting(key, value);
              if (change) changes.push(change);
            } catch (error) {
              problems.push(`${key}: ${errorMessage(error)}`);
            }
          }
          record(changes);
          if (problems.length && !changes.length)
            throw new Error(problems.join(" "));
          return {
            changed: changes.map((change) => change.key),
            ...(problems.length ? { notChanged: problems } : {}),
          };
        }
        if (args.action === "check_updates") {
          if (!isUpdaterAvailable())
            return {
              note: "This version of the app is updated by its app store, not from inside the app.",
            };
          const updates = useUpdateStore.getState();
          await updates.checkForUpdates({ suppressUpToDateToast: true });
          const state = useUpdateStore.getState();
          if (state.phase === "error")
            throw new Error(
              state.errorMessage ?? "Couldn't check for updates.",
            );
          return state.updateInfo && state.phase === "available"
            ? {
                available: state.updateInfo.version,
                current: state.updateInfo.currentVersion,
                note: "The player installs it from Settings › Updates.",
              }
            : { upToDate: true };
        }
        throw new Error("action must be get, set or check_updates.");
      },
    }),
  ];
}
