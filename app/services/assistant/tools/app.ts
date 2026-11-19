import { getScenarioById } from "@/services/scenario.service";
import { currentSyncSession, importCloudTale } from "@/services/tale-library";
import { useScenarioDraftStore } from "@/store/useScenarioDraftStore";
import { SETTINGS_TABS, type SettingsTab } from "@/store/useSettingsModalStore";
import {
  STORY_PANEL_TABS,
  type StoryPanelTab,
} from "@/store/useStoryPanelStore";
import { useTaleStore } from "@/store/useTaleStore";
import { isUpdaterAvailable, useUpdateStore } from "@/store/useUpdateStore";
import { getTalePlayLoad } from "@/repositories/tale.repository";
import type { SettingChange } from "@/types/assistant.type";
import { changeSetting } from "../app-changes";
import { APP_SETTINGS, SETTING_KEYS } from "../app-settings";
import { describeRoute } from "../context";
import { changedParts } from "../scenario-changes";
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

async function hasUnsavedScenario(): Promise<boolean> {
  const draft = useScenarioDraftStore.getState().draft?.read();
  if (!draft) return false;
  const { thumbnail: _thumbnail, ...open } = draft;
  if (!draft.id)
    return Boolean(
      open.content.length ||
        open.description.trim() ||
        !["", "untitled scenario"].includes(open.name.trim().toLowerCase()),
    );
  const stored = await getScenarioById(draft.id);
  if (!stored) return true;
  const { thumbnail: _storedThumbnail, ...saved } = stored;
  return changedParts(saved, open).length > 0;
}

function shownValue(key: string) {
  const value = APP_SETTINGS[key].read();
  if (value && typeof value === "object" && "custom" in value) {
    const prompt = value as { custom: boolean; text: string | null };
    return prompt.custom ? (prompt.text ?? "") : null;
  }
  return value;
}

export function createAppTools(context: AssistantToolContext): AssistantTool[] {
  const record = (changes: SettingChange[]) => {
    if (changes.length) context.recordChanges?.(changes);
  };

  const pathFor = async (
    page: Page,
    id: string | undefined,
    query: string | undefined,
  ): Promise<{ to: string; search?: Record<string, unknown> }> => {
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
        return {
          to: "/scenarios",
          search: { tab: "local", ...(query ? { q: query } : {}) },
        };
      case "discover":
        return {
          to: "/scenarios",
          search: { tab: "discover", ...(query ? { q: query } : {}) },
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
  };

  return [
    defineTool({
      name: "show",
      description:
        "Show the player a screen: a page, a tale on the play screen, a Settings tab, or a tab of the play screen's side panel. Use it to open the place where the player does something you can't.",
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
          enum: STORY_PANEL_TABS.filter((tab) => tab !== "hakawati"),
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
        const page = text(args.page) as Page | undefined;
        if (page && !PAGES.includes(page))
          throw new Error(`page must be one of: ${PAGES.join(", ")}.`);
        const id = text(args.id);
        const shown: string[] = [];
        let tale: string | undefined;
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
            const local = await getTalePlayLoad(id, { logLimit: 0 }).catch(
              () => null,
            );
            const taleId = local
              ? id
              : await importCloudTale(currentSyncSession(), id).catch(
                  (error) => {
                    throw new Error(
                      `No tale has that id here or in the cloud (${errorMessage(error)}).`,
                    );
                  },
                );
            await withTaleWrites(signal, () => ui.openTale(taleId));
            tale = useTaleStore.getState().name;
            shown.push(`tale ${tale}`);
          } else {
            if (page === "play" && !useTaleStore.getState().id)
              throw new Error("No tale is loaded. Give the tale's id.");
            const { to, search } = await pathFor(page, id, text(args.query));
            await ui.navigate(to, search ? { search } : undefined);
            shown.push(page);
          }
        }
        const panel = text(args.panel) as StoryPanelTab | undefined;
        if (panel) {
          if (!describeRoute(context.getPathname()).page.startsWith("play"))
            throw new Error(
              "Side-panel tabs are only on the play screen. Show play first.",
            );
          ui.showPanelTab(panel);
          shown.push(`${panel} tab`);
        }
        const settings = text(args.settings) as SettingsTab | undefined;
        if (settings) {
          if (!SETTINGS_TABS.includes(settings))
            throw new Error(
              `settings must be one of: ${SETTINGS_TABS.join(", ")}.`,
            );
          ui.showSettings(settings);
          shown.push(`${settings} settings`);
        }
        if (!shown.length)
          throw new Error("Say what to show: page, settings or panel.");
        return { shown, ...(tale ? { tale } : {}) };
      },
      outcome: (output) =>
        output && typeof output === "object" && "tale" in output
          ? text((output as { tale: unknown }).tale)
          : undefined,
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
                value: shownValue(key),
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
