import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaleSessionState } from "@/lib/tale-storage";
import { GameMode, LogEntryMode, LogEntryRole, type LogEntry } from "@/types";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
vi.mock("@/services/sync-wakeup", () => ({ wakeSyncBackground: vi.fn() }));

type SqlParam = string | number | bigint | Uint8Array | null;
const db = vi.hoisted(() => ({
  raw: null as import("node:sqlite").DatabaseSync | null,
}));

function adapter() {
  const raw = db.raw!;
  return {
    path: "sqlite:test",
    async execute(sql: string, params: SqlParam[] = []) {
      return { rowsAffected: Number(raw.prepare(sql).run(...params).changes) };
    },
    async select<T>(sql: string, params: SqlParam[] = []) {
      return raw.prepare(sql).all(...params) as T;
    },
  };
}

vi.mock("@/services/db", () => ({ getDb: async () => adapter() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (
    command: string,
    args: {
      sql?: string;
      values?: SqlParam[];
      select?: boolean;
      commit?: boolean;
    },
  ) => {
    const database = adapter();
    if (command === "begin_database_transaction") {
      await database.execute("BEGIN");
      return 1;
    }
    if (command === "query_database_transaction")
      return args.select
        ? database.select(args.sql!, args.values)
        : database.execute(args.sql!, args.values);
    if (command === "end_database_transaction") {
      await database.execute(args.commit ? "COMMIT" : "ROLLBACK");
      return;
    }
    throw new Error(`Unexpected native command: ${command}`);
  },
}));

import * as repo from "@/repositories/tale.repository";
import { commitTaleTurn, getTaleById } from "@/services/tale.service";
import { useTaleStore } from "@/store/useTaleStore";
import {
  beginPlayActivity,
  usePlayActivityStore,
} from "@/store/usePlayActivityStore";
import {
  deletePassages,
  editTaleSetup,
  insertPassages,
  revertChanges,
  rewritePassage,
  toLogEntry,
  withTaleWrites,
} from "./tale-edits";
import { createTaleTools } from "./tools/tale";

const gm = (id: string, text = id): LogEntry => ({
  id,
  role: LogEntryRole.GM,
  mode: LogEntryMode.STORY,
  text,
});
const player = (id: string, text = id): LogEntry => ({
  id,
  role: LogEntryRole.PLAYER,
  mode: LogEntryMode.DO,
  text,
});

async function createTale(turns: LogEntry[][], gameMode = GameMode.GM) {
  const taleId = await repo.createTale({
    name: "Signal",
    description: "",
    components: [],
    storyCards: [],
    stats: [{ name: "HP", value: 7, range: [0, 10] }],
    inventory: [],
    log: [],
    gameMode,
    undoStack: [],
  });
  const state = (await repo.getCurrentState(taleId))!;
  for (const [index, entries] of turns.entries())
    await repo.appendTurn(
      taleId,
      { entries, createdAt: index + 1 },
      state,
      createTaleSessionState(),
    );
  return taleId;
}

async function loadIntoStore(taleId: string) {
  const tale = (await getTaleById(taleId))!;
  useTaleStore.setState({
    id: taleId,
    name: tale.name,
    description: tale.description,
    components: tale.components,
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: tale.log,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
    totalLogCount: tale.totalLogCount,
    oldestLoadedIndex: tale.oldestLoadedIndex,
  });
}

async function storedIds(taleId: string) {
  const count = await repo.getLogCount(taleId);
  return (await repo.getLogEntries(taleId, 0, count)).map((e) => e.id);
}

function turnRows(taleId: string) {
  return db
    .raw!.prepare(
      `SELECT seq, entry_start_index AS start, entry_count AS count
       FROM tale_turns WHERE tale_id = ? ORDER BY seq`,
    )
    .all(taleId) as Array<{ seq: number; start: number; count: number }>;
}

function expectContiguous(taleId: string) {
  let start = 0;
  for (const [index, row] of turnRows(taleId).entries()) {
    expect(row).toMatchObject({ seq: index + 1, start });
    start += row.count;
  }
  const [{ log_count }] = db
    .raw!.prepare(`SELECT log_count FROM tales WHERE id = ?`)
    .all(taleId) as Array<{ log_count: number }>;
  expect(log_count).toBe(start);
}

beforeEach(() => {
  db.raw = new DatabaseSync(":memory:");
  db.raw.exec("PRAGMA foreign_keys = ON");
  const dir = join(process.cwd(), "src-tauri", "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.raw.exec(readFileSync(join(dir, file), "utf8"));
  useTaleStore.setState(useTaleStore.getInitialState());
  usePlayActivityStore.setState({
    narrating: 0,
    saving: 0,
    assistantWriting: 0,
  });
});

afterEach(() => {
  db.raw?.close();
  db.raw = null;
});

describe("log splices", () => {
  it("removes passages from inside turns and whole turns, keeping the log contiguous", async () => {
    const taleId = await createTale([
      [player("p1"), gm("g1")],
      [player("p2"), gm("g2")],
      [gm("g3")],
    ]);
    await repo.deleteLogEntries(taleId, ["g1", "p2", "g2"]);
    expect(await storedIds(taleId)).toEqual(["p1", "g3"]);
    expect(turnRows(taleId).map((r) => r.count)).toEqual([1, 1]);
    expectContiguous(taleId);
    await expect(repo.deleteLogEntries(taleId, ["missing"])).rejects.toThrow(
      "not found",
    );
  });

  it("adds passages inside a turn, after the last passage, or at the start", async () => {
    const taleId = await createTale([[player("p1"), gm("g1")], [gm("g2")]]);
    await repo.insertLogEntries(taleId, "p1", [gm("a")]);
    await repo.insertLogEntries(taleId, "g2", [gm("end1"), gm("end2")]);
    await repo.insertLogEntries(taleId, null, [gm("first")]);
    expect(await storedIds(taleId)).toEqual([
      "first",
      "p1",
      "a",
      "g1",
      "g2",
      "end1",
      "end2",
    ]);
    expect(turnRows(taleId).map((r) => r.count)).toEqual([4, 1, 2]);
    expectContiguous(taleId);
  });

  it("starts the log of an empty tale", async () => {
    const taleId = await createTale([]);
    await repo.insertLogEntries(taleId, null, [gm("only")]);
    expect(await storedIds(taleId)).toEqual(["only"]);
    expectContiguous(taleId);
  });
});

describe("Hakawati's edits", () => {
  it("keeps an edit to the open tale when the next narrator turn saves", async () => {
    const taleId = await createTale([[gm("g1")]]);
    await loadIntoStore(taleId);
    await withTaleWrites(undefined, () =>
      editTaleSetup(taleId, (tale) => {
        tale.addCard({ title: "Mara", content: "A smuggler." });
      }),
    );
    expect(useTaleStore.getState().storyCards.map((c) => c.title)).toEqual([
      "Mara",
    ]);
    const store = useTaleStore.getState();
    await commitTaleTurn({
      id: taleId,
      tale: {
        name: store.name,
        description: store.description,
        components: store.components,
        storyCards: store.storyCards,
        stats: store.stats,
        inventory: store.inventory,
        gameMode: store.gameMode,
        undoStack: store.undoStack,
      },
      entries: [player("p2"), gm("g2")],
    });
    const saved = await getTaleById(taleId);
    expect(saved?.storyCards.map((c) => c.title)).toEqual(["Mara"]);
  });

  it("edits a tale that isn't open without touching the open one", async () => {
    const open = await createTale([[gm("g1")]]);
    const other = await createTale([[gm("x1")]]);
    await loadIntoStore(open);
    await editTaleSetup(other, (tale) => tale.setField("name", "Renamed"));
    expect((await getTaleById(other))?.name).toBe("Renamed");
    expect(useTaleStore.getState().name).toBe("Signal");
  });

  it("changes the open tale's story in memory and storage, and undoes it", async () => {
    const taleId = await createTale([
      [player("p1"), gm("g1", "The lamp flickers.")],
      [player("p2"), gm("g2")],
    ]);
    await loadIntoStore(taleId);
    useTaleStore.setState({ undoStack: [gm("redo-me")] });
    const changes = [
      await rewritePassage(taleId, "g1", "The lamp goes out."),
      await insertPassages(taleId, "g1", [
        toLogEntry({ by: "narrator", text: "A bell rings." }),
      ]),
      ...(await deletePassages(taleId, ["p2", "g2"])),
    ];
    const inserted = (changes[1] as { entries: LogEntry[] }).entries[0].id;
    const expected = ["p1", "g1", inserted];
    expect(await storedIds(taleId)).toEqual(expected);
    const store = useTaleStore.getState();
    expect(store.log.map((e) => e.id)).toEqual(expected);
    expect(store.log[1].text).toBe("The lamp goes out.");
    expect(store.totalLogCount).toBe(3);
    expect(store.undoStack).toEqual([]);
    expectContiguous(taleId);

    const undone = await revertChanges(changes);
    expect(undone.every((change) => change.undone)).toBe(true);
    expect(await storedIds(taleId)).toEqual(["p1", "g1", "p2", "g2"]);
    expect(useTaleStore.getState().log.map((e) => e.id)).toEqual([
      "p1",
      "g1",
      "p2",
      "g2",
    ]);
    expect(useTaleStore.getState().log[1].text).toBe("The lamp flickers.");
    expectContiguous(taleId);
  });

  it("shifts the loaded part of a long story for changes before it", async () => {
    const taleId = await createTale([
      [gm("a")],
      [gm("b")],
      [gm("c")],
      [gm("d")],
    ]);
    await loadIntoStore(taleId);
    const all = useTaleStore.getState().log;
    useTaleStore.setState({ log: all.slice(2), oldestLoadedIndex: 2 });
    await deletePassages(taleId, ["a"]);
    await insertPassages(taleId, null, [gm("z1"), gm("z2")]);
    const store = useTaleStore.getState();
    expect(store.log.map((e) => e.id)).toEqual(["c", "d"]);
    expect(store.oldestLoadedIndex).toBe(3);
    expect(store.totalLogCount).toBe(5);
    expect(await storedIds(taleId)).toEqual(["z1", "z2", "b", "c", "d"]);
  });

  it("leaves passages that were changed again since", async () => {
    const taleId = await createTale([[gm("g1", "Before")]]);
    const change = await rewritePassage(taleId, "g1", "Hakawati's");
    await repo.updateLogEntry(taleId, "g1", { text: "The player's" });
    const [result] = await revertChanges([change]);
    expect(result.undone).toBeUndefined();
    expect((await repo.getLogEntries(taleId, 0, 1))[0].text).toBe(
      "The player's",
    );
  });

  it("puts removed passages back before their neighbour when the one before is gone", async () => {
    const taleId = await createTale([[gm("a")], [gm("b")], [gm("c")]]);
    const removed = await deletePassages(taleId, ["b"]);
    await repo.deleteLogEntries(taleId, ["a"]);
    await revertChanges(removed);
    expect(await storedIds(taleId)).toEqual(["b", "c"]);
  });

  it("waits for the narrator to finish before writing", async () => {
    const taleId = await createTale([[gm("g1")]]);
    const endNarration = beginPlayActivity("narrating");
    let wrote = false;
    const writing = withTaleWrites(undefined, async () => {
      wrote = true;
      return editTaleSetup(taleId, (tale) => tale.setField("name", "Later"));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wrote).toBe(false);
    endNarration();
    await writing;
    expect(wrote).toBe(true);
    expect(usePlayActivityStore.getState().assistantWriting).toBe(0);
  });
});

describe("Hakawati's tale tools", () => {
  const tools = (taleId: string, recorded: unknown[]) => {
    useTaleStore.setState({ id: taleId });
    const list = createTaleTools({
      getPathname: () => "/play",
      recordChanges: (changes) => recorded.push(...changes),
    });
    return (name: string, args: Record<string, unknown>) =>
      list
        .find((tool) => tool.definition.function.name === name)!
        .run(args, undefined) as Promise<Record<string, unknown>>;
  };

  it("edits the open tale's cards and records the changes", async () => {
    const taleId = await createTale([[gm("g1")]]);
    await loadIntoStore(taleId);
    const recorded: unknown[] = [];
    const run = tools(taleId, recorded);
    const result = await run("edit_story_cards", {
      ops: [
        {
          op: "add",
          title: "Mara",
          content: "A smuggler.",
          triggers: ["Mara"],
        },
      ],
    });
    expect(result).toMatchObject({ changed: 1, added: [{ title: "Mara" }] });
    expect(recorded).toHaveLength(1);
  });

  it("refuses stats and inventory in a Story Teller tale and changes nothing", async () => {
    const taleId = await createTale([[gm("g1")]], GameMode.STORY_TELLER);
    await loadIntoStore(taleId);
    const recorded: unknown[] = [];
    await expect(
      tools(taleId, recorded)("edit_character", {
        ops: [{ op: "add_item", name: "Flare" }],
      }),
    ).rejects.toThrow("Game Master mode");
    expect(recorded).toEqual([]);
  });

  it("adds passages at the start of the story", async () => {
    const taleId = await createTale([[gm("g1")]]);
    await loadIntoStore(taleId);
    const result = await tools(taleId, [])("edit_log", {
      ops: [
        {
          op: "insert",
          after: "start",
          passages: [{ by: "narrator", text: "Long ago." }],
        },
      ],
    });
    const [first] = result.inserted as string[];
    expect((await storedIds(taleId))[0]).toBe(first);
    expect(useTaleStore.getState().log[0].id).toBe(first);
  });
});
