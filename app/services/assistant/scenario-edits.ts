import { getScenarioPublishLink } from "@/repositories/scenario-publish-link.repository";
import {
  getScenarioById,
  removeScenario,
  saveScenario,
} from "@/services/scenario.service";
import { saveAsScenario } from "@/services/tale.service";
import { useScenarioDraftStore } from "@/store/useScenarioDraftStore";
import { GameMode, type Scenario } from "@/types/context.type";
import type { ScenarioChange, ScenarioRecord } from "@/types/assistant.type";
import {
  changedParts,
  revertScenario,
  ScenarioEdits,
} from "./scenario-changes";

export const NEW_SCENARIO = "new";

export function withoutThumbnail(scenario: Scenario): ScenarioRecord {
  const { thumbnail: _thumbnail, ...record } = scenario;
  return record;
}

export function openDraft() {
  return useScenarioDraftStore.getState().draft;
}

async function readStored(id: string): Promise<Scenario> {
  const scenario = await getScenarioById(id);
  if (!scenario) throw new Error("No saved scenario has that id.");
  return scenario;
}

async function saveToLibrary(
  record: ScenarioRecord,
  thumbnail: Scenario["thumbnail"],
  id?: string,
) {
  const savedId = await saveScenario(
    { ...record, thumbnail: thumbnail ?? null },
    id,
  );
  const saved = withoutThumbnail(await readStored(savedId));
  return saved;
}

/**
 * Edits the scenario open in the editor when there is one and `scenario` is left out or names it;
 * otherwise a saved scenario, or a new one when `scenario` is "new".
 */
export async function editScenario(
  scenario: string | undefined,
  edit: (edits: ScenarioEdits) => void,
): Promise<ScenarioChange | null> {
  const draft = openDraft();
  const open = draft?.read();
  if (draft && open && (!scenario || scenario === open.id)) {
    const before = withoutThumbnail(open);
    const edits = new ScenarioEdits(before);
    edit(edits);
    if (!changedParts(before, edits.record).length) return null;
    draft.write({ ...draft.read(), ...edits.record });
    return {
      kind: "scenario",
      target: "draft",
      scenarioId: before.id,
      before,
      after: edits.record,
    };
  }
  if (!scenario)
    throw new Error(
      'No scenario is open in the editor. Give a scenario id, or "new" to create one.',
    );
  if (scenario === NEW_SCENARIO) {
    const edits = new ScenarioEdits({
      id: "",
      name: "",
      initialGameMode: GameMode.STORY_TELLER,
      description: "",
      content: [],
    });
    edit(edits);
    if (!edits.record.name.trim())
      throw new Error("A new scenario needs a name.");
    const after = await saveToLibrary(edits.record, null);
    return {
      kind: "scenario",
      target: "library",
      scenarioId: after.id,
      before: null,
      after,
    };
  }
  const stored = await readStored(scenario);
  const before = withoutThumbnail(stored);
  const edits = new ScenarioEdits(before);
  edit(edits);
  if (!changedParts(before, edits.record).length) return null;
  const after = await saveToLibrary(edits.record, stored.thumbnail, scenario);
  return {
    kind: "scenario",
    target: "library",
    scenarioId: scenario,
    before,
    after,
  };
}

/** Saves a tale's setup as a new scenario in the library, like Save as scenario in Tales. */
export async function scenarioFromTale(
  taleId: string,
): Promise<ScenarioChange> {
  const id = await saveAsScenario(taleId);
  const after = withoutThumbnail(await readStored(id));
  return {
    kind: "scenario",
    target: "library",
    scenarioId: id,
    before: null,
    after,
  };
}

async function revertCreated(change: ScenarioChange): Promise<boolean> {
  const stored = await getScenarioById(change.scenarioId);
  if (!stored) return true;
  const unchanged = !changedParts(withoutThumbnail(stored), change.after)
    .length;
  if (!unchanged || (await getScenarioPublishLink(change.scenarioId)))
    return false;
  await removeScenario(change.scenarioId);
  return true;
}

/**
 * Undoes scenario changes, newest first. Returns the changes with what was undone marked,
 * and how many parts were kept because they were changed since.
 */
export async function revertScenarioChanges(
  changes: ScenarioChange[],
): Promise<{ changes: ScenarioChange[]; kept: number }> {
  const result = changes.map((change) => ({ ...change }));
  let kept = 0;
  for (const change of [...result].reverse()) {
    if (change.undone) continue;
    if (!change.before) {
      if (await revertCreated(change)) {
        change.undone = true;
      } else kept += 1;
      continue;
    }
    if (change.target === "draft") {
      const draft = openDraft();
      const open = draft?.read();
      if (!draft || !open || open.id !== change.scenarioId) {
        kept += changedParts(change.before, change.after).length;
        continue;
      }
      const {
        next,
        reverted,
        kept: left,
      } = revertScenario(withoutThumbnail(open), change.before, change.after);
      kept += left;
      if (reverted) {
        draft.write({ ...draft.read(), ...next });
        change.undone = true;
      }
      continue;
    }
    const stored = await getScenarioById(change.scenarioId);
    if (!stored) {
      kept += 1;
      continue;
    }
    const {
      next,
      reverted,
      kept: left,
    } = revertScenario(withoutThumbnail(stored), change.before, change.after);
    kept += left;
    if (reverted) {
      await saveScenario(
        { ...next, thumbnail: stored.thumbnail ?? null },
        change.scenarioId,
      );
      change.undone = true;
    }
  }
  return { changes: result, kept };
}
