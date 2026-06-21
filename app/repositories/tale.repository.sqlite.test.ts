import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTaleCurrentState,
  createTaleSessionState,
} from "@/lib/tale-storage";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";
import type { TaleMutableSnapshot } from "@/services/tale.service";

type SqlParam = string | number | bigint | Uint8Array | null;

type TestDatabase = {
  execute: (sql: string, params?: SqlParam[]) => Promise<void>;
  select: <T>(sql: string, params?: SqlParam[]) => Promise<T>;
  close: () => void;
  raw: DatabaseSync;
  selectSql: string[];
  executeSql: string[];
};

const dbState = vi.hoisted(() => ({
  current: null as TestDatabase | null,
}));

vi.mock("@/services/db", () => ({
  getDb: vi.fn(async () => {
    if (!dbState.current) {
      throw new Error("Test database was not initialized");
    }
    return dbState.current;
  }),
}));

function createAdapter(): TestDatabase {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  let transactionOpen = false;
  const selectSql: string[] = [];
  const executeSql: string[] = [];

  return {
    raw,
    selectSql,
    executeSql,
    async execute(sql: string, params: SqlParam[] = []) {
      const command = sql.trim().split(/\s+/)[0]?.toUpperCase();
      executeSql.push(sql);
      if (command === "BEGIN") {
        if (transactionOpen) {
          throw new Error("cannot start a transaction within a transaction");
        }
        transactionOpen = true;
      }

      try {
        raw.prepare(sql).run(...params);
      } catch (error) {
        if (command === "ROLLBACK" && !transactionOpen) {
          throw new Error("cannot rollback - no transaction is active");
        }
        throw error;
      } finally {
        if (command === "COMMIT" || command === "ROLLBACK") {
          transactionOpen = false;
        }
      }
    },
    async select<T>(sql: string, params: SqlParam[] = []) {
      selectSql.push(sql);
      return raw.prepare(sql).all(...params) as T;
    },
    close() {
      raw.close();
    },
  } as TestDatabase;
}

const migrationFiles = [
  "001_create_scenarios.sql",
  "002_create_tales.sql",
  "003_add_prompt_components.sql",
  "004_split_tale_storage.sql",
  "005_add_sync_metadata.sql",
];

function applyMigration(db: TestDatabase, index: number) {
  db.raw.exec(
    readFileSync(
      join(process.cwd(), "src-tauri", "migrations", migrationFiles[index]),
      "utf8",
    ),
  );
}

function applyMigrations(db: TestDatabase, count = migrationFiles.length) {
  for (let index = 0; index < count; index += 1) {
    applyMigration(db, index);
  }
}

function gmEntry(id: string, text = id): LogEntry {
  return {
    id,
    role: LogEntryRole.GM,
    mode: LogEntryMode.STORY,
    text,
  };
}

function playerEntry(id: string, text = id): LogEntry {
  return {
    id,
    role: LogEntryRole.PLAYER,
    mode: LogEntryMode.DO,
    text,
  };
}

function emptyState() {
  return createTaleCurrentState({
    components: [],
    storyCards: [],
    stats: [],
    inventory: [],
  });
}

async function createEmptyTale() {
  const { createTale } = await import("./tale.repository");
  return createTale({
    name: "Iron Valley",
    description: "A local tale.",
    components: [],
    storyCards: [],
    stats: [],
    inventory: [],
    log: [],
    gameMode: GameMode.STORY_TELLER,
    undoStack: [],
  });
}

describe("tale repository SQLite storage", () => {
  beforeEach(() => {
    dbState.current = createAdapter();
  });

  afterEach(() => {
    dbState.current?.close();
    dbState.current = null;
  });

  it("migrates legacy tale blobs into state, session, and indexed one-entry turns", () => {
    const db = dbState.current!;
    applyMigrations(db, 3);

    const log = [playerEntry("legacy-player"), gmEntry("legacy-gm")];
    db.raw
      .prepare(
        `INSERT INTO tales (
          id,
          name,
          description,
          thumbnail_data,
          author_note,
          story_cards,
          scenario_id,
          stats,
          inventory,
          undo_stack,
          log,
          game_mode,
          version,
          created_at,
          updated_at,
          components
        )
        VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        "legacy-tale",
        "Legacy",
        "Legacy description",
        "Remember the gate.",
        JSON.stringify([
          { id: "card", title: "Gate", triggers: [], content: "" },
        ]),
        JSON.stringify([{ name: "HP", value: 10, range: [0, 20] }]),
        JSON.stringify([{ id: "item", name: "Lantern" }]),
        JSON.stringify([gmEntry("undo")]),
        JSON.stringify(log),
        GameMode.STORY_TELLER,
        100,
        200,
        JSON.stringify([]),
      );

    applyMigration(db, 3);

    const stateRows = db.raw
      .prepare("SELECT * FROM tale_states WHERE tale_id = ?")
      .all("legacy-tale");
    const sessionRows = db.raw
      .prepare("SELECT * FROM tale_sessions WHERE tale_id = ?")
      .all("legacy-tale");
    const turns = db.raw
      .prepare(
        `SELECT seq, entries_json, entry_start_index, entry_count
         FROM tale_turns
         WHERE tale_id = ?
         ORDER BY seq ASC`,
      )
      .all("legacy-tale") as Array<{
      seq: number;
      entries_json: string;
      entry_start_index: number;
      entry_count: number;
    }>;
    const summary = db.raw
      .prepare(
        `SELECT log_count, last_log_entry_json
         FROM tales
         WHERE id = ?`,
      )
      .get("legacy-tale") as {
      log_count: number;
      last_log_entry_json: string;
    };

    expect(stateRows).toHaveLength(1);
    expect(sessionRows).toHaveLength(1);
    expect(turns.map((turn) => turn.seq)).toEqual([1, 2]);
    expect(turns.map((turn) => turn.entry_start_index)).toEqual([0, 1]);
    expect(turns.map((turn) => turn.entry_count)).toEqual([1, 1]);
    expect(JSON.parse(turns[0].entries_json)[0].id).toBe("legacy-player");
    expect(JSON.parse(turns[1].entries_json)[0].id).toBe("legacy-gm");
    expect(summary.log_count).toBe(2);
    expect(JSON.parse(summary.last_log_entry_json).id).toBe("legacy-gm");
  });

  it("falls back when legacy JSON fields are valid but not expected arrays", () => {
    const db = dbState.current!;
    applyMigrations(db, 3);

    db.raw
      .prepare(
        `INSERT INTO tales (
          id,
          name,
          description,
          thumbnail_data,
          author_note,
          story_cards,
          scenario_id,
          stats,
          inventory,
          undo_stack,
          log,
          game_mode,
          version,
          created_at,
          updated_at,
          components
        )
        VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        "wrong-shape-tale",
        "Wrong Shape",
        "Legacy description",
        "Remember the gate.",
        "{}",
        "{}",
        "{}",
        "{}",
        "{}",
        GameMode.STORY_TELLER,
        100,
        200,
        "{}",
      );

    applyMigration(db, 3);

    const stateRow = db.raw
      .prepare("SELECT state_json FROM tale_states WHERE tale_id = ?")
      .get("wrong-shape-tale") as { state_json: string };
    const sessionRow = db.raw
      .prepare("SELECT undo_stack_json FROM tale_sessions WHERE tale_id = ?")
      .get("wrong-shape-tale") as { undo_stack_json: string };
    const turnCount = db.raw
      .prepare("SELECT COUNT(*) AS count FROM tale_turns WHERE tale_id = ?")
      .get("wrong-shape-tale") as { count: number };
    const summary = db.raw
      .prepare(
        `SELECT log_count, last_log_entry_json
         FROM tales
         WHERE id = ?`,
      )
      .get("wrong-shape-tale") as {
      log_count: number;
      last_log_entry_json: string | null;
    };
    const state = JSON.parse(stateRow.state_json);

    expect(state.components).toEqual([]);
    expect(state.storyCards).toEqual([]);
    expect(state.gm.stats).toEqual([]);
    expect(state.gm.inventory).toEqual([]);
    expect(JSON.parse(sessionRow.undo_stack_json)).toEqual([]);
    expect(turnCount.count).toBe(0);
    expect(summary.log_count).toBe(0);
    expect(summary.last_log_entry_json).toBeNull();
  });

  it("appends, reads, replaces, edits, and trims true multi-entry turns", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const {
      appendTurn,
      getLogCount,
      getLogEntries,
      replaceTurnContainingEntries,
      trimLogToEntryCount,
      updateLogEntry,
    } = await import("./tale.repository");
    const taleId = await createEmptyTale();
    const state = emptyState();
    const session = createTaleSessionState();
    const player = playerEntry("player-1", "Open the door.");
    const gm = gmEntry("gm-1", "The hinges scream.");

    await appendTurn(
      taleId,
      { entries: [player, gm], createdAt: 300 },
      state,
      session,
    );

    const rows = db.raw
      .prepare("SELECT * FROM tale_turns WHERE tale_id = ?")
      .all(taleId) as Array<{ entries_json: string; entry_count: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].entry_count).toBe(2);
    expect(
      JSON.parse(rows[0].entries_json).map((entry: LogEntry) => entry.id),
    ).toEqual(["player-1", "gm-1"]);
    expect(await getLogCount(taleId)).toBe(2);
    expect(
      (await getLogEntries(taleId, 0, 2)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-1"]);

    const newGm = gmEntry("gm-2", "The door opens.");
    await replaceTurnContainingEntries(
      taleId,
      [player.id, gm.id],
      { entries: [player, newGm], createdAt: 400 },
      state,
      session,
    );
    expect(
      (await getLogEntries(taleId, 0, 2)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-2"]);

    await appendTurn(
      taleId,
      {
        entries: [playerEntry("player-2"), gmEntry("gm-3")],
        createdAt: 500,
      },
      state,
      session,
    );
    await updateLogEntry(
      taleId,
      "gm-2",
      { text: "The iron door opens." },
      state,
      session,
    );
    expect((await getLogEntries(taleId, 1, 1))[0].text).toBe(
      "The iron door opens.",
    );

    await trimLogToEntryCount(taleId, 3, state, session);
    expect(await getLogCount(taleId)).toBe(3);
    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-2", "player-2"]);
    const trimmedRows = db.raw
      .prepare("SELECT * FROM tale_turns WHERE tale_id = ? ORDER BY seq ASC")
      .all(taleId) as Array<{ entry_count: number }>;
    expect(trimmedRows.map((row) => row.entry_count)).toEqual([2, 1]);
  });

  it("rejects child-table writes for missing tales before creating orphan rows", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const {
      appendTurn,
      getLogCount,
      replaceCurrentState,
      replaceTurns,
      trimLogToEntryCount,
    } = await import("./tale.repository");
    const state = emptyState();
    const session = createTaleSessionState();

    await expect(
      appendTurn(
        "missing-tale",
        { entries: [gmEntry("gm-1")], createdAt: 1 },
        state,
        session,
      ),
    ).rejects.toThrow("Tale not found");
    await expect(
      replaceCurrentState("missing-tale", state, session),
    ).rejects.toThrow("Tale not found");
    await expect(
      replaceTurns("missing-tale", [
        { id: "turn-1", seq: 1, entries: [gmEntry("gm-2")], createdAt: 2 },
      ]),
    ).rejects.toThrow("Tale not found");
    await expect(
      trimLogToEntryCount("missing-tale", 0, state, session),
    ).rejects.toThrow("Tale not found");

    expect(await getLogCount("missing-tale")).toBe(0);
    expect(
      db.raw
        .prepare("SELECT COUNT(*) AS count FROM tale_turns WHERE tale_id = ?")
        .get("missing-tale"),
    ).toMatchObject({ count: 0 });
    expect(
      db.raw
        .prepare("SELECT COUNT(*) AS count FROM tale_states WHERE tale_id = ?")
        .get("missing-tale"),
    ).toMatchObject({ count: 0 });
    expect(
      db.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM tale_sessions WHERE tale_id = ?",
        )
        .get("missing-tale"),
    ).toMatchObject({ count: 0 });
  });

  it("stores new split tales in split tables while legacy blobs stay placeholders", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const { createTale, getTale } = await import("./tale.repository");

    const taleId = await createTale({
      name: "Split Canon",
      description: "Canonical split storage.",
      components: [],
      storyCards: [],
      stats: [{ name: "HP", value: 12, range: [0, 20] }],
      inventory: [{ id: "item-1", name: "Lantern" }],
      log: [playerEntry("player-1"), gmEntry("gm-1")],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [gmEntry("undo-1")],
    });

    const legacyRow = db.raw
      .prepare(
        `SELECT components, story_cards, stats, inventory, log, undo_stack
         FROM tales
         WHERE id = ?`,
      )
      .get(taleId) as Record<string, string>;
    const tale = await getTale(taleId);

    expect(JSON.parse(legacyRow.components)).toEqual([]);
    expect(JSON.parse(legacyRow.story_cards)).toEqual([]);
    expect(JSON.parse(legacyRow.stats)).toEqual([]);
    expect(JSON.parse(legacyRow.inventory)).toEqual([]);
    expect(JSON.parse(legacyRow.log)).toEqual([]);
    expect(JSON.parse(legacyRow.undo_stack)).toEqual([]);
    expect(tale?.log.map((entry) => entry.id)).toEqual(["player-1", "gm-1"]);
    expect(tale?.stats[0].value).toBe(12);
    expect(tale?.inventory[0].name).toBe("Lantern");
    expect(tale?.undoStack[0].id).toBe("undo-1");
  });

  it("rejects turn replacement when requested entry anchors are missing", async () => {
    applyMigrations(dbState.current!);
    const { appendTurn, getLogEntries, replaceTurnContainingEntries } =
      await import("./tale.repository");
    const taleId = await createEmptyTale();
    const state = emptyState();
    const session = createTaleSessionState();
    const player = playerEntry("player-1");
    const gm = gmEntry("gm-1");

    await appendTurn(
      taleId,
      { entries: [player, gm], createdAt: 1 },
      state,
      session,
    );

    await expect(
      replaceTurnContainingEntries(
        taleId,
        [],
        { entries: [player, gmEntry("gm-2")], createdAt: 2 },
        state,
        session,
      ),
    ).rejects.toThrow("without entry anchors");

    await expect(
      replaceTurnContainingEntries(
        taleId,
        [player.id, "missing-entry"],
        { entries: [player, gmEntry("gm-2")], createdAt: 2 },
        state,
        session,
      ),
    ).rejects.toThrow("all requested entries");

    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-1"]);
  });

  it("rejects turn replacement across non-contiguous matched rows", async () => {
    applyMigrations(dbState.current!);
    const { appendTurn, getLogEntries, replaceTurnContainingEntries } =
      await import("./tale.repository");
    const taleId = await createEmptyTale();
    const state = emptyState();
    const session = createTaleSessionState();

    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-1")], createdAt: 1 },
      state,
      session,
    );
    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-2")], createdAt: 2 },
      state,
      session,
    );
    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-3")], createdAt: 3 },
      state,
      session,
    );

    await expect(
      replaceTurnContainingEntries(
        taleId,
        ["gm-1", "gm-3"],
        { entries: [gmEntry("gm-replacement")], createdAt: 4 },
        state,
        session,
      ),
    ).rejects.toThrow("non-contiguous");

    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => entry.id),
    ).toEqual(["gm-1", "gm-2", "gm-3"]);
  });

  it("persists play operations through product-level service methods", async () => {
    applyMigrations(dbState.current!);
    const { getLogEntries } = await import("./tale.repository");
    const {
      commitTaleTurn,
      completePendingTaleTurn,
      editTaleLogEntry,
      redoTaleLogEntry,
      retryTaleLogEntry,
      retryTaleTurn,
      undoTaleLogToEntryCount,
    } = await import("../services/tale.service");
    const taleId = await createEmptyTale();
    const tale: TaleMutableSnapshot = {
      name: "Iron Valley",
      description: "A local tale.",
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [],
    };
    const player = playerEntry("player-1", "Open the door.");
    const gm = gmEntry("gm-1", "The hinges scream.");

    await commitTaleTurn({
      id: taleId,
      tale,
      entries: [player],
      createdAt: 1,
    });
    await completePendingTaleTurn({
      id: taleId,
      tale,
      pendingEntries: [player],
      entries: [player, gm],
      createdAt: 2,
    });

    const editedGm = { ...gm, text: "The hinges scream. " };
    await editTaleLogEntry({
      id: taleId,
      tale,
      entryId: gm.id,
      patch: { text: editedGm.text },
    });

    const continuation = gmEntry("gm-2", "The dark answers.");
    await commitTaleTurn({
      id: taleId,
      tale,
      entries: [continuation],
      createdAt: 3,
    });

    const retriedGm = gmEntry("gm-retry", "The door opens cleanly.");
    await retryTaleTurn({
      id: taleId,
      tale,
      previousEntries: [player, editedGm],
      entries: [player, retriedGm],
      createdAt: 4,
    });

    const retriedContinuation = gmEntry("gm-3", "Fresh air rolls in.");
    await retryTaleLogEntry({
      id: taleId,
      tale,
      previousEntry: continuation,
      replacementEntry: retriedContinuation,
    });

    await undoTaleLogToEntryCount({
      id: taleId,
      tale,
      entryCount: 2,
    });
    await redoTaleLogEntry({
      id: taleId,
      tale,
      entry: retriedContinuation,
      createdAt: 5,
    });

    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => [
        entry.id,
        entry.text,
      ]),
    ).toEqual([
      ["player-1", "Open the door."],
      ["gm-retry", "The door opens cleanly."],
      ["gm-3", "Fresh air rolls in."],
    ]);
  });

  it("replaces a retried Story continuation without dropping manual story text", async () => {
    applyMigrations(dbState.current!);
    const {
      appendTurn,
      exportTalePackage,
      getLogEntries,
      replaceLogEntryInTurn,
    } = await import("./tale.repository");
    const taleId = await createEmptyTale();
    const state = emptyState();
    const session = createTaleSessionState();
    const manualStory: LogEntry = {
      id: "manual-story",
      role: LogEntryRole.GM,
      mode: LogEntryMode.STORY,
      text: "\n\nA secret door appears. ",
      chainId: "story-chain",
    };
    const generatedGm: LogEntry = {
      id: "generated-gm",
      role: LogEntryRole.GM,
      mode: LogEntryMode.STORY,
      text: "The room falls silent.",
      chainId: "story-chain",
    };
    const retriedGm: LogEntry = {
      ...generatedGm,
      id: "generated-gm-retry",
      text: "The room answers with a low hum.",
    };

    await appendTurn(
      taleId,
      { entries: [manualStory, generatedGm], createdAt: 1 },
      state,
      session,
    );
    await replaceLogEntryInTurn(
      taleId,
      generatedGm.id,
      retriedGm,
      state,
      session,
    );

    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => [
        entry.id,
        entry.text,
      ]),
    ).toEqual([
      ["manual-story", "\n\nA secret door appears. "],
      ["generated-gm-retry", "The room answers with a low hum."],
    ]);

    const exported = await exportTalePackage(taleId);
    expect(exported.turns).toHaveLength(1);
    expect(exported.turns[0].entries.map((entry) => entry.id)).toEqual([
      "manual-story",
      "generated-gm-retry",
    ]);
  });

  it("round-trips package turns without flattening grouping or exporting session data", async () => {
    applyMigrations(dbState.current!);
    const { appendTurn, exportTalePackage, importTalePackage } = await import(
      "./tale.repository"
    );
    const taleId = await createEmptyTale();
    const state = emptyState();

    await appendTurn(
      taleId,
      {
        entries: [playerEntry("player-1"), gmEntry("gm-1")],
        createdAt: 10,
      },
      state,
      createTaleSessionState({ undoStack: [gmEntry("undo")] }),
    );
    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-2")], createdAt: 20 },
      state,
      createTaleSessionState({ undoStack: [gmEntry("undo")] }),
    );

    const exported = await exportTalePackage(taleId);
    const importedId = await importTalePackage(exported);
    const reexported = await exportTalePackage(importedId);

    expect(
      exported.turns.map((turn) => turn.entries.map((entry) => entry.id)),
    ).toEqual([["player-1", "gm-1"], ["gm-2"]]);
    expect(
      reexported.turns.map((turn) => turn.entries.map((entry) => entry.id)),
    ).toEqual([["player-1", "gm-1"], ["gm-2"]]);
    expect("session" in exported).toBe(false);
  });

  it("imports packages into split tables while keeping legacy blobs as placeholders", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const { appendTurn, exportTalePackage, importTalePackage, getLogEntries } =
      await import("./tale.repository");
    const taleId = await createEmptyTale();
    await appendTurn(
      taleId,
      { entries: [playerEntry("player-1"), gmEntry("gm-1")], createdAt: 10 },
      emptyState(),
      createTaleSessionState(),
    );

    const importedId = await importTalePackage(await exportTalePackage(taleId));
    const legacyRow = db.raw
      .prepare(
        `SELECT components, story_cards, stats, inventory, log, undo_stack
         FROM tales
         WHERE id = ?`,
      )
      .get(importedId) as Record<string, string>;

    expect(JSON.parse(legacyRow.components)).toEqual([]);
    expect(JSON.parse(legacyRow.story_cards)).toEqual([]);
    expect(JSON.parse(legacyRow.stats)).toEqual([]);
    expect(JSON.parse(legacyRow.inventory)).toEqual([]);
    expect(JSON.parse(legacyRow.log)).toEqual([]);
    expect(JSON.parse(legacyRow.undo_stack)).toEqual([]);
    expect(
      (await getLogEntries(importedId, 0, 10)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-1"]);
  });

  it("replaces an existing tale from a package without changing its local id", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const {
      appendTurn,
      createTale,
      exportTalePackage,
      getTale,
      replaceTaleWithPackage,
    } = await import("./tale.repository");
    const localId = await createEmptyTale();
    await appendTurn(
      localId,
      { entries: [gmEntry("local-gm", "Local branch.")], createdAt: 10 },
      emptyState(),
      createTaleSessionState({ undoStack: [gmEntry("local-undo")] }),
    );
    const remoteSourceId = await createTale({
      name: "Remote Canon",
      description: "Remote wins.",
      components: [],
      storyCards: [],
      stats: [{ name: "HP", value: 7, range: [0, 10] }],
      inventory: [{ id: "remote-item", name: "Compass" }],
      log: [playerEntry("remote-player"), gmEntry("remote-gm")],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [gmEntry("remote-undo")],
    });

    await replaceTaleWithPackage(
      localId,
      await exportTalePackage(remoteSourceId),
    );

    const replaced = await getTale(localId);
    const sessionRow = db.raw
      .prepare("SELECT undo_stack_json FROM tale_sessions WHERE tale_id = ?")
      .get(localId) as { undo_stack_json: string };

    expect(replaced?.id).toBe(localId);
    expect(replaced?.name).toBe("Remote Canon");
    expect(replaced?.description).toBe("Remote wins.");
    expect(replaced?.stats[0].value).toBe(7);
    expect(replaced?.inventory[0].name).toBe("Compass");
    expect(replaced?.log.map((entry) => entry.id)).toEqual([
      "remote-player",
      "remote-gm",
    ]);
    expect(JSON.parse(sessionRow.undo_stack_json)).toEqual([]);
  });

  it("edits log text without replacing current state or session snapshots", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const { appendTurn, getCurrentState, getLogEntries } = await import(
      "./tale.repository"
    );
    const { editTaleLogEntry } = await import("../services/tale.service");
    const taleId = await createEmptyTale();
    const persistedState = createTaleCurrentState({
      components: [],
      storyCards: [],
      stats: [{ name: "HP", value: 12, range: [0, 20] }],
      inventory: [{ id: "item-1", name: "Lantern" }],
    });
    const persistedSession = createTaleSessionState({
      undoStack: [gmEntry("undo-original")],
    });
    const staleSnapshot: TaleMutableSnapshot = {
      name: "Stale",
      description: "Should not replace state.",
      components: [],
      storyCards: [],
      stats: [{ name: "HP", value: 99, range: [0, 100] }],
      inventory: [{ id: "stale-item", name: "Stale item" }],
      gameMode: GameMode.STORY_TELLER,
      undoStack: [gmEntry("undo-stale")],
    };

    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-1", "Before edit.")], createdAt: 1 },
      persistedState,
      persistedSession,
    );
    await editTaleLogEntry({
      id: taleId,
      tale: staleSnapshot,
      entryId: "gm-1",
      patch: { text: "After edit." },
    });

    const currentState = await getCurrentState(taleId);
    const sessionRow = db.raw
      .prepare("SELECT undo_stack_json FROM tale_sessions WHERE tale_id = ?")
      .get(taleId) as { undo_stack_json: string };

    expect((await getLogEntries(taleId, 0, 10))[0].text).toBe("After edit.");
    expect(currentState?.gm.stats[0].value).toBe(12);
    expect(currentState?.gm.inventory[0].name).toBe("Lantern");
    expect(JSON.parse(sessionRow.undo_stack_json)[0].id).toBe("undo-original");
  });

  it("rejects package imports with invalid local content semantics", async () => {
    applyMigrations(dbState.current!);
    const { appendTurn, exportTalePackage, importTalePackage } = await import(
      "./tale.repository"
    );
    const taleId = await createEmptyTale();
    await appendTurn(
      taleId,
      { entries: [playerEntry("player-1"), gmEntry("gm-1")], createdAt: 10 },
      emptyState(),
      createTaleSessionState(),
    );
    await appendTurn(
      taleId,
      { entries: [gmEntry("gm-2")], createdAt: 20 },
      emptyState(),
      createTaleSessionState(),
    );
    const exported = await exportTalePackage(taleId);

    await expect(
      importTalePackage({
        ...exported,
        turns: [{ ...exported.turns[0], seq: 2 }],
      }),
    ).rejects.toThrow("contiguous");

    await expect(
      importTalePackage({
        ...exported,
        turns: [{ ...exported.turns[0], entries: [] }],
      }),
    ).rejects.toThrow("at least one log entry");

    await expect(
      importTalePackage({
        ...exported,
        turns: [exported.turns[0], { ...exported.turns[0], seq: 2 }],
      }),
    ).rejects.toThrow("unique ids");

    await expect(
      importTalePackage({
        ...exported,
        turns: [
          exported.turns[0],
          {
            ...exported.turns[1],
            entries: [
              {
                ...exported.turns[1].entries[0],
                id: exported.turns[0].entries[0].id,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow("log entries must have unique ids");

    await expect(
      importTalePackage({
        ...exported,
        tale: { ...exported.tale, thumbnailAssetId: "missing-thumbnail" },
      }),
    ).rejects.toThrow("thumbnail asset is missing");
  });

  it("serializes complete reads, play-window reads, and exports without DB read transactions", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const { appendTurn, exportTalePackage, getTale, getTalePlayLoad } =
      await import("./tale.repository");
    const taleId = await createEmptyTale();
    await appendTurn(
      taleId,
      { entries: [playerEntry("player-1"), gmEntry("gm-1")], createdAt: 10 },
      emptyState(),
      createTaleSessionState(),
    );
    db.executeSql.length = 0;

    const completeTale = await getTale(taleId);
    const playLoad = await getTalePlayLoad(taleId, { logLimit: 1 });
    const exported = await exportTalePackage(taleId);

    expect(completeTale?.log.map((entry) => entry.id)).toEqual([
      "player-1",
      "gm-1",
    ]);
    expect(playLoad?.log.map((entry) => entry.id)).toEqual(["gm-1"]);
    expect(exported.turns[0].entries.map((entry) => entry.id)).toEqual([
      "player-1",
      "gm-1",
    ]);
    expect(
      db.executeSql.filter((sql) => sql.trim().toUpperCase() === "BEGIN"),
    ).toHaveLength(0);
  });

  it("loads long tale windows and list summaries from indexed turn rows", async () => {
    const db = dbState.current!;
    applyMigrations(db);
    const { getLogCount, getTalePlayLoad, getTales, replaceTurns } =
      await import("./tale.repository");
    const taleId = await createEmptyTale();
    const turns = Array.from({ length: 240 }, (_, index) => {
      const seq = index + 1;
      const entries =
        seq % 3 === 0
          ? [playerEntry(`player-${seq}`), gmEntry(`gm-${seq}`)]
          : [gmEntry(`gm-${seq}`)];
      return {
        id: `turn-${seq}`,
        seq,
        entries,
        createdAt: 1000 + seq,
      };
    });
    const expectedCount = turns.reduce(
      (sum, turn) => sum + turn.entries.length,
      0,
    );

    await replaceTurns(taleId, turns);

    expect(await getLogCount(taleId)).toBe(expectedCount);
    const tale = await getTalePlayLoad(taleId, {
      logStart: expectedCount - 10,
      logLimit: 10,
    });
    const summaries = await getTales(1, 10);
    const summaryRow = db.raw
      .prepare(
        `SELECT log_count, last_log_entry_json
         FROM tales
         WHERE id = ?`,
      )
      .get(taleId) as {
      log_count: number;
      last_log_entry_json: string;
    };

    expect(tale?.log).toHaveLength(10);
    expect(summaryRow.log_count).toBe(expectedCount);
    expect(JSON.parse(summaryRow.last_log_entry_json).id).toBe("gm-240");
    expect(summaries.data[0].logCount).toBe(expectedCount);
    expect(summaries.data[0].lastLogEntry?.id).toBe("gm-240");
    expect(
      dbState.current!.selectSql.some((sql) =>
        sql.includes("entry_start_index < ?"),
      ),
    ).toBe(true);
    expect(
      dbState.current!.selectSql.some((sql) =>
        sql.includes("GROUP BY tale_id"),
      ),
    ).toBe(false);
  });

  it("serializes overlapping local writes without nested transactions", async () => {
    applyMigrations(dbState.current!);
    const { appendTurn, getLogEntries, replaceCurrentState } = await import(
      "./tale.repository"
    );
    const taleId = await createEmptyTale();
    const state = emptyState();
    const session = createTaleSessionState();

    await Promise.all([
      appendTurn(
        taleId,
        { entries: [playerEntry("player-1"), gmEntry("gm-1")], createdAt: 1 },
        state,
        session,
      ),
      replaceCurrentState(taleId, state, session),
      appendTurn(
        taleId,
        { entries: [gmEntry("gm-2")], createdAt: 2 },
        state,
        session,
      ),
    ]);

    expect(
      (await getLogEntries(taleId, 0, 10)).map((entry) => entry.id),
    ).toEqual(["player-1", "gm-1", "gm-2"]);
    expect(
      dbState.current!.executeSql.some(
        (sql) => sql.trim().toUpperCase().split(/\s+/)[0] === "BEGIN",
      ),
    ).toBe(false);
  });
});
