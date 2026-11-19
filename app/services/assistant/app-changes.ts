import { useSettingsStore } from "@/store/useSettingsStore";
import type { ModelRole } from "@/types";
import type {
  AppChange,
  RoleChange,
  SettingChange,
} from "@/types/assistant.type";
import { APP_SETTINGS } from "./app-settings";
import { same } from "./tale-changes";

export function settingEntry(key: string) {
  const entry = APP_SETTINGS[key];
  if (!entry)
    throw new Error(
      `There is no setting called ${key}. Use settings get to see them all.`,
    );
  return entry;
}

/** Changes one setting and records it, or returns null when it already had that value. */
export function changeSetting(
  key: string,
  input: unknown,
): SettingChange | null {
  const entry = settingEntry(key);
  const value = entry.parse(input);
  const before = entry.read();
  if (same(before, value)) return null;
  entry.apply(value);
  const after = entry.read();
  return same(before, after) ? null : { kind: "setting", key, before, after };
}

export function changeRole(
  role: ModelRole,
  label: string,
  change: () => void,
): RoleChange | null {
  const read = () => useSettingsStore.getState();
  const before = structuredClone(read().roleAssignments[role]);
  const contextBefore = read().contextWindow;
  change();
  const after = structuredClone(read().roleAssignments[role]);
  const contextAfter = read().contextWindow;
  if (same(before, after) && contextBefore === contextAfter) return null;
  return {
    kind: "role",
    role,
    before,
    after,
    label,
    ...(contextBefore !== contextAfter
      ? { contextWindow: { before: contextBefore, after: contextAfter } }
      : {}),
  };
}

/** Undoes setting and AI Setup changes, newest first, where they still hold what Hakawati set. */
export function revertAppChanges(changes: AppChange[]): {
  changes: AppChange[];
  kept: number;
} {
  const result = changes.map((change) => ({ ...change }));
  let kept = 0;
  for (const change of [...result].reverse()) {
    if (change.undone) continue;
    if (change.kind === "setting") {
      const entry = APP_SETTINGS[change.key];
      if (entry && same(entry.read(), change.after)) {
        entry.apply(change.before);
        change.undone = true;
      } else kept += 1;
      continue;
    }
    const state = useSettingsStore.getState();
    if (!same(state.roleAssignments[change.role], change.after)) {
      kept += 1;
      continue;
    }
    state.restoreRoleAssignment(change.role, change.before);
    if (
      change.contextWindow &&
      useSettingsStore.getState().contextWindow === change.contextWindow.after
    )
      useSettingsStore.setState({ contextWindow: change.contextWindow.before });
    change.undone = true;
  }
  return { changes: result, kept };
}
