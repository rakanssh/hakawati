import { nanoid } from "nanoid";
import { normalizePromptComponents } from "@/lib/prompt-components";
import { normalizeStoryCard } from "@/lib/story-card-utils";
import { createTaleSessionState } from "@/lib/tale-storage";
import {
  deleteLogEntries,
  findLogEntries,
  getLogEntries,
  getTalePlayLoad,
  insertLogEntries,
  updateLogEntry,
} from "@/repositories/tale.repository";
import { wakeSyncBackground } from "@/services/sync-wakeup";
import {
  persistCurrentTale,
  type TaleMutableSnapshot,
} from "@/services/tale.service";
import { claimPlayActivity } from "@/store/usePlayActivityStore";
import { useTaleStore } from "@/store/useTaleStore";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types";
import type { TaleChange } from "@/types/assistant.type";
import { isStateChange, revertStateChange, TaleChanges } from "./tale-changes";

/** The play screen keeps the loaded tale in memory and saves it over storage, so edits to it go through the store. */
const isLoaded = (taleId: string) => useTaleStore.getState().id === taleId;

function loadedSnapshot(): TaleMutableSnapshot {
  const state = useTaleStore.getState();
  return {
    name: state.name,
    description: state.description,
    components: state.components,
    storyCards: state.storyCards,
    stats: state.stats,
    inventory: state.inventory,
    gameMode: state.gameMode,
    undoStack: state.undoStack,
  };
}

async function readSnapshot(
  taleId: string,
): Promise<TaleMutableSnapshot | null> {
  if (isLoaded(taleId)) return loadedSnapshot();
  const tale = await getTalePlayLoad(taleId, { logLimit: 0 });
  if (!tale) return null;
  return {
    name: tale.name,
    description: tale.description,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards.map(normalizeStoryCard),
    stats: tale.stats,
    inventory: tale.inventory,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
  };
}

async function writeSnapshot(taleId: string, tale: TaleMutableSnapshot) {
  if (isLoaded(taleId)) {
    useTaleStore.setState({
      name: tale.name,
      description: tale.description,
      components: tale.components,
      storyCards: tale.storyCards,
      stats: tale.stats,
      inventory: tale.inventory,
      gameMode: tale.gameMode,
    });
  }
  await persistCurrentTale({ id: taleId, tale });
  wakeSyncBackground();
}

/** Waits for the narrator and any save to finish, and holds the tale while Hakawati writes. */
export async function withTaleWrites<T>(
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const release = await claimPlayActivity(
    "assistantWriting",
    ["narrating", "saving"],
    signal,
  );
  try {
    return await run();
  } finally {
    release();
  }
}

export async function editTaleSetup(
  taleId: string,
  edit: (changes: TaleChanges) => void,
): Promise<TaleChange[]> {
  const tale = await readSnapshot(taleId);
  if (!tale) throw new Error("No tale has that id.");
  const changes = new TaleChanges(taleId, tale);
  edit(changes);
  if (changes.changes.length) await writeSnapshot(taleId, changes.tale);
  return changes.changes;
}

async function readPassages(taleId: string, ids: string[]) {
  const found = await findLogEntries(taleId, ids);
  return new Map(found.map((passage) => [passage.entry.id, passage]));
}

async function readPassage(taleId: string, id: string) {
  return (await readPassages(taleId, [id])).get(id) ?? null;
}

async function passageAt(taleId: string, index: number) {
  if (index < 0) return null;
  const [entry] = await getLogEntries(taleId, index, 1);
  return entry ?? null;
}

const clearedRedo = () => createTaleSessionState({ undoStack: [] });

export async function rewritePassage(
  taleId: string,
  id: string,
  text: string,
): Promise<TaleChange> {
  const found = await readPassage(taleId, id);
  if (!found) throw new Error(`No passage has id ${id}.`);
  await updateLogEntry(taleId, id, { text });
  if (isLoaded(taleId)) useTaleStore.getState().updateLogEntry(id, { text });
  wakeSyncBackground();
  return { taleId, kind: "passage", id, before: found.entry.text, after: text };
}

export interface NewPassage {
  by: "narrator" | "player";
  mode?: LogEntryMode;
  text: string;
}

export function toLogEntry(passage: NewPassage): LogEntry {
  const id = nanoid();
  return passage.by === "player"
    ? {
        id,
        role: LogEntryRole.PLAYER,
        mode: passage.mode ?? LogEntryMode.DO,
        text: passage.text,
      }
    : {
        id,
        role: LogEntryRole.GM,
        mode: LogEntryMode.STORY,
        text: passage.text,
        chainId: id,
      };
}

function loadedPosition(afterId: string | null): number {
  const { log, oldestLoadedIndex } = useTaleStore.getState();
  if (afterId === null) return oldestLoadedIndex === 0 ? 0 : -1;
  const index = log.findIndex((entry) => entry.id === afterId);
  return index < 0 ? -1 : index + 1;
}

function insertIntoLoadedLog(afterId: string | null, entries: LogEntry[]) {
  const state = useTaleStore.getState();
  const at = loadedPosition(afterId);
  useTaleStore.setState({
    log:
      at >= 0
        ? [...state.log.slice(0, at), ...entries, ...state.log.slice(at)]
        : state.log,
    oldestLoadedIndex: state.oldestLoadedIndex + (at >= 0 ? 0 : entries.length),
    totalLogCount: state.totalLogCount + entries.length,
    undoStack: [],
  });
}

function removeFromLoadedLog(ids: Set<string>) {
  const state = useTaleStore.getState();
  const log = state.log.filter((entry) => !ids.has(entry.id));
  const removedBefore = ids.size - (state.log.length - log.length);
  useTaleStore.setState({
    log,
    oldestLoadedIndex: Math.max(0, state.oldestLoadedIndex - removedBefore),
    totalLogCount: Math.max(0, state.totalLogCount - ids.size),
    undoStack: [],
  });
}

export async function insertPassages(
  taleId: string,
  afterId: string | null,
  entries: LogEntry[],
): Promise<TaleChange> {
  if (afterId !== null && !(await readPassage(taleId, afterId)))
    throw new Error(`No passage has id ${afterId}.`);
  await insertLogEntries(taleId, afterId, entries, clearedRedo());
  if (isLoaded(taleId)) insertIntoLoadedLog(afterId, entries);
  wakeSyncBackground();
  return { taleId, kind: "insert", afterId, entries };
}

/** Removes passages, recording each run of neighbouring ones with what surrounded it. */
export async function deletePassages(
  taleId: string,
  ids: string[],
): Promise<TaleChange[]> {
  const unique = [...new Set(ids)];
  const byId = await readPassages(taleId, unique);
  const missing = unique.find((id) => !byId.has(id));
  if (missing) throw new Error(`No passage has id ${missing}.`);
  const found = [...byId.values()].sort((a, b) => a.index - b.index);
  const runs: Array<typeof found> = [];
  for (const passage of found) {
    const run = runs.at(-1);
    if (run && run.at(-1)!.index + 1 === passage.index) run.push(passage);
    else runs.push([passage]);
  }
  const changes: TaleChange[] = [];
  for (const run of runs) {
    const previous = await passageAt(taleId, run[0].index - 1);
    const next = await passageAt(taleId, run.at(-1)!.index + 1);
    changes.push({
      taleId,
      kind: "delete",
      previousId: previous?.id ?? null,
      nextId: next?.id ?? null,
      entries: run.map(({ entry }) => entry),
    });
  }
  await deleteLogEntries(taleId, unique, clearedRedo());
  if (isLoaded(taleId)) removeFromLoadedLog(new Set(unique));
  wakeSyncBackground();
  return changes;
}

async function revertLogChange(change: TaleChange): Promise<boolean> {
  const { taleId } = change;
  if (change.kind === "passage") {
    const found = await readPassage(taleId, change.id);
    if (!found || found.entry.text !== change.after) return false;
    await updateLogEntry(taleId, change.id, { text: change.before });
    if (isLoaded(taleId))
      useTaleStore
        .getState()
        .updateLogEntry(change.id, { text: change.before });
    return true;
  }
  if (change.kind === "insert") {
    const ids = change.entries.map((entry) => entry.id);
    const found = await readPassages(taleId, ids);
    if (
      change.entries.some(
        (entry) => found.get(entry.id)?.entry.text !== entry.text,
      )
    )
      return false;
    await deleteLogEntries(taleId, ids, clearedRedo());
    if (isLoaded(taleId)) removeFromLoadedLog(new Set(ids));
    return true;
  }
  if (change.kind === "delete") {
    const ids = change.entries.map((entry) => entry.id);
    if ((await readPassages(taleId, ids)).size) return false;
    let afterId: string | null | undefined;
    if (change.previousId && (await readPassage(taleId, change.previousId)))
      afterId = change.previousId;
    else if (change.nextId) {
      const next = await readPassage(taleId, change.nextId);
      if (next)
        afterId =
          next.index === 0
            ? null
            : (await passageAt(taleId, next.index - 1))?.id;
    } else if (!change.previousId) afterId = null;
    if (afterId === undefined) return false;
    await insertLogEntries(taleId, afterId, change.entries, clearedRedo());
    if (isLoaded(taleId)) insertIntoLoadedLog(afterId, change.entries);
    return true;
  }
  return false;
}

/** Undoes changes newest first, leaving any that were changed again since; returns them marked. */
export async function revertChanges(
  changes: TaleChange[],
  signal?: AbortSignal,
): Promise<TaleChange[]> {
  return withTaleWrites(signal, async () => {
    const result = changes.map((change) => ({ ...change }));
    const newestFirst = result.filter((change) => !change.undone).reverse();
    for (const taleId of new Set(newestFirst.map((change) => change.taleId))) {
      const ofTale = newestFirst.filter((change) => change.taleId === taleId);
      let tale = await readSnapshot(taleId);
      if (!tale) continue;
      let changed = false;
      for (const change of ofTale) {
        if (!isStateChange(change)) continue;
        const reverted = revertStateChange(tale, change);
        if (!reverted) continue;
        tale = reverted;
        change.undone = true;
        changed = true;
      }
      if (changed) await writeSnapshot(taleId, tale);
      for (const change of ofTale)
        if (!isStateChange(change) && (await revertLogChange(change)))
          change.undone = true;
    }
    wakeSyncBackground();
    return result;
  });
}
