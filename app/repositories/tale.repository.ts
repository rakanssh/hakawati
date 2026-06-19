import { getDb, type Database } from "@/services/db";
import { Tale, TaleHead } from "@/types/tale.type";
import { LogEntry } from "@/types/log.type";
import { normalizePromptComponents } from "@/lib/prompt-components";
import { parseJsonValue, toUint8Array } from "@/lib/repository-utils";
import { normalizeStoryCard } from "@/lib/story-card-utils";
import {
  createTaleSessionState,
  createTaleCurrentState,
  sanitizeLogEntries,
  sanitizeTurnEntries,
  TALE_SCHEMA_VERSION,
  TALE_STATE_SCHEMA_VERSION,
  type TaleCurrentState,
  type TaleSessionState,
  type TaleTurn,
} from "@/lib/tale-storage";
import {
  enqueueLocalOperation,
  enqueueLocalWrite,
} from "@/lib/local-write-queue";
import {
  GameMode,
  PromptComponent,
  PromptComponentType,
} from "@/types/context.type";
import {
  PaginatedResponse,
  TaleRow,
  TaleSessionRow,
  TaleStateRow,
  TaleTurnRow,
} from "@/types/db.type";
import { TalePackageV1, TalePackageV1Schema } from "@/types/export.type";
import { getScenario, getScenarioHead } from "./scenario.repository";
import { v4 as uuidv4 } from "uuid";

type TaleCurrentDataInput = {
  id: string;
  name: Tale["name"];
  description: Tale["description"];
  components: Tale["components"];
  storyCards: Tale["storyCards"];
  stats: Tale["stats"];
  inventory: Tale["inventory"];
  gameMode: Tale["gameMode"];
  undoStack: Tale["undoStack"];
  updatedAt?: Tale["updatedAt"];
};

type LogEntryPatch = Partial<Omit<LogEntry, "id">>;

const LEGACY_JSON_PLACEHOLDER = "[]";

export type TalePlayLoad = Omit<Tale, "log"> & {
  log: LogEntry[];
  totalLogCount: number;
  oldestLoadedIndex: number;
};

function getAuthorNote(components: PromptComponent[]): string {
  return (
    components.find(
      (component) => component.type === PromptComponentType.AUTHOR_NOTE,
    )?.content ?? ""
  );
}

function legacyComponentsFromRow(r: TaleRow): PromptComponent[] {
  return [
    {
      id: "legacy-plot",
      type: PromptComponentType.PLOT,
      content: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
    {
      id: "legacy-author-note",
      type: PromptComponentType.AUTHOR_NOTE,
      content: r.author_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  ];
}

function legacyStateFromRow(r: TaleRow): TaleCurrentState {
  const components =
    parseJsonValue<PromptComponent[]>(r.components) ??
    legacyComponentsFromRow(r);

  return createTaleCurrentState({
    components: normalizePromptComponents(components),
    storyCards: parseJsonValue<Tale["storyCards"]>(r.story_cards) ?? [],
    stats: parseJsonValue<Tale["stats"]>(r.stats) ?? [],
    inventory: parseJsonValue<Tale["inventory"]>(r.inventory) ?? [],
  });
}

function parseStateRow(
  stateRow: TaleStateRow | null,
  fallback: TaleCurrentState,
): TaleCurrentState {
  const parsed = parseJsonValue<Partial<TaleCurrentState>>(
    stateRow?.state_json,
  );
  const gm = parsed?.gm;

  return createTaleCurrentState({
    components: Array.isArray(parsed?.components)
      ? normalizePromptComponents(parsed.components)
      : fallback.components,
    storyCards: Array.isArray(parsed?.storyCards)
      ? parsed.storyCards
      : fallback.storyCards,
    stats: Array.isArray(gm?.stats) ? gm.stats : fallback.gm.stats,
    inventory: Array.isArray(gm?.inventory)
      ? gm.inventory
      : fallback.gm.inventory,
    scratchpad:
      gm?.scratchpad && typeof gm.scratchpad === "object"
        ? gm.scratchpad
        : fallback.gm.scratchpad,
  });
}

function parseTurnEntries(row: Pick<TaleTurnRow, "entries_json">): LogEntry[] {
  const entries = parseJsonValue<LogEntry[]>(row.entries_json);
  return Array.isArray(entries) ? entries : [];
}

function toTale(
  row: TaleRow,
  state: TaleCurrentState,
  log: LogEntry[],
  undoStack: LogEntry[],
): Tale {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnail: toUint8Array(row.thumbnail_data ?? null),
    components: normalizePromptComponents(state.components),
    storyCards: state.storyCards,
    scenarioId: row.scenario_id ?? undefined,
    stats: state.gm.stats,
    inventory: state.gm.inventory,
    log,
    undoStack,
    gameMode:
      row.game_mode === GameMode.STORY_TELLER
        ? GameMode.STORY_TELLER
        : GameMode.GM,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function withTransaction<T>(
  db: Database,
  run: () => Promise<T>,
): Promise<T> {
  void db;
  // ponytail: tauri-plugin-sql uses a pool; BEGIN/COMMIT across separate calls
  // can land on different connections. enqueueLocalWrite is the write lock.
  return run();
}

async function withReadTransaction<T>(
  _db: Database,
  run: () => Promise<T>,
): Promise<T> {
  return run();
}

async function selectTaleRow(
  db: Database,
  taleId: string,
): Promise<TaleRow | null> {
  const rows = await db.select<TaleRow[]>(
    `SELECT * FROM tales WHERE id = ? LIMIT 1`,
    [taleId],
  );
  return rows?.[0] ?? null;
}

async function requireTaleRow(db: Database, taleId: string): Promise<TaleRow> {
  const row = await selectTaleRow(db, taleId);
  if (!row) throw new Error("Tale not found");
  return row;
}

async function selectStateRow(
  db: Database,
  taleId: string,
): Promise<TaleStateRow | null> {
  const rows = await db.select<TaleStateRow[]>(
    `SELECT * FROM tale_states WHERE tale_id = ? LIMIT 1`,
    [taleId],
  );
  return rows?.[0] ?? null;
}

async function hasSplitStorage(db: Database, taleId: string): Promise<boolean> {
  const rows = await db.select<Array<{ ok: number }>>(
    `SELECT 1 AS ok FROM tale_states WHERE tale_id = ? LIMIT 1`,
    [taleId],
  );
  return Boolean(rows?.[0]);
}

async function selectSessionUndoStack(
  db: Database,
  taleId: string,
  legacyRow: TaleRow,
): Promise<LogEntry[]> {
  const rows = await db.select<TaleSessionRow[]>(
    `SELECT * FROM tale_sessions WHERE tale_id = ? LIMIT 1`,
    [taleId],
  );
  return (
    parseJsonValue<LogEntry[]>(rows?.[0]?.undo_stack_json) ??
    parseJsonValue<LogEntry[]>(legacyRow.undo_stack) ??
    []
  );
}

async function selectLogCount(db: Database, taleId: string): Promise<number> {
  if (await hasSplitStorage(db, taleId)) {
    const rows = await db.select<Array<{ log_count: number }>>(
      `SELECT log_count FROM tales WHERE id = ? LIMIT 1`,
      [taleId],
    );
    return rows?.[0]?.log_count ?? 0;
  }

  const rows = await db.select<Array<{ log: string }>>(
    `SELECT log FROM tales WHERE id = ? LIMIT 1`,
    [taleId],
  );
  return parseJsonValue<LogEntry[]>(rows?.[0]?.log)?.length ?? 0;
}

async function refreshTaleLogSummary(
  db: Database,
  taleId: string,
): Promise<void> {
  const rows = await db.select<
    Array<{ log_count: number; last_log_entry_json: string | null }>
  >(
    `SELECT
       entry_start_index + entry_count AS log_count,
       json_extract(entries_json, '$[' || (entry_count - 1) || ']') AS last_log_entry_json
     FROM tale_turns
     WHERE tale_id = ?
     ORDER BY seq DESC
     LIMIT 1`,
    [taleId],
  );
  const summary = rows?.[0] ?? { log_count: 0, last_log_entry_json: null };
  await db.execute(
    `UPDATE tales
     SET log_count = ?, last_log_entry_json = ?
     WHERE id = ?`,
    [summary.log_count, summary.last_log_entry_json, taleId],
  );
}

async function selectLogEntries(
  db: Database,
  taleId: string,
  startIndex: number,
  limit: number,
): Promise<LogEntry[]> {
  if (startIndex < 0 || limit <= 0) return [];

  if (await hasSplitStorage(db, taleId)) {
    const rows = await db.select<TaleTurnRow[]>(
      `SELECT * FROM tale_turns
       WHERE tale_id = ?
         AND entry_start_index < ?
         AND (entry_start_index + entry_count) > ?
       ORDER BY seq ASC
       `,
      [taleId, startIndex + limit, startIndex],
    );
    if (rows.length === 0) return [];

    const firstEntryIndex = rows[0].entry_start_index;
    const flattened = rows.flatMap((turn) => parseTurnEntries(turn));
    const sliceStart = Math.max(0, startIndex - firstEntryIndex);
    return flattened.slice(sliceStart, sliceStart + limit);
  }

  const rows = await db.select<Array<{ log: string }>>(
    `SELECT log FROM tales WHERE id = ? LIMIT 1`,
    [taleId],
  );
  const fullLog = parseJsonValue<LogEntry[]>(rows?.[0]?.log) ?? [];
  return fullLog.slice(startIndex, startIndex + limit);
}

async function selectTurnCount(db: Database, taleId: string): Promise<number> {
  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COALESCE(MAX(seq), 0) as count FROM tale_turns WHERE tale_id = ?`,
    [taleId],
  );
  return rows?.[0]?.count ?? 0;
}

async function selectTurnRowsForEntryIds(
  db: Database,
  taleId: string,
  entryIds: string[],
): Promise<TaleTurnRow[]> {
  const uniqueEntryIds = Array.from(new Set(entryIds));
  if (uniqueEntryIds.length === 0) return [];

  const placeholders = uniqueEntryIds.map(() => "?").join(", ");
  return db.select<TaleTurnRow[]>(
    `SELECT DISTINCT tt.*
     FROM tale_turns tt, json_each(tt.entries_json) entry
     WHERE tt.tale_id = ?
       AND json_extract(entry.value, '$.id') IN (${placeholders})
     ORDER BY tt.seq ASC`,
    [taleId, ...uniqueEntryIds],
  );
}

async function reindexTurns(db: Database, taleId: string): Promise<void> {
  const rows = await db.select<TaleTurnRow[]>(
    `SELECT * FROM tale_turns WHERE tale_id = ? ORDER BY seq ASC`,
    [taleId],
  );
  let entryStartIndex = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const entries = sanitizeTurnEntries(parseTurnEntries(rows[index]));
    await db.execute(
      `UPDATE tale_turns
       SET seq = ?, entry_start_index = ?, entry_count = ?, entries_json = ?
       WHERE id = ?`,
      [
        index + 1,
        entryStartIndex,
        entries.length,
        JSON.stringify(entries),
        rows[index].id,
      ],
    );
    entryStartIndex += entries.length;
  }
}

async function insertTurn(
  db: Database,
  taleId: string,
  turn: Pick<TaleTurn, "entries" | "createdAt"> & Partial<Pick<TaleTurn, "id">>,
  seq: number,
  entryStartIndex: number,
  timestamp: number,
): Promise<number> {
  const entries = sanitizeTurnEntries(turn.entries);
  const createdAt = turn.createdAt ?? timestamp;
  await db.execute(
    `INSERT INTO tale_turns (
       id,
       tale_id,
       seq,
       entries_json,
       entry_start_index,
       entry_count,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      turn.id ?? uuidv4(),
      taleId,
      seq,
      JSON.stringify(entries),
      entryStartIndex,
      entries.length,
      createdAt,
      timestamp,
    ],
  );
  return entries.length;
}

async function insertTurns(
  db: Database,
  taleId: string,
  turns: Array<
    Pick<TaleTurn, "entries" | "createdAt"> & Partial<Pick<TaleTurn, "id">>
  >,
  startSeq: number,
  startEntryIndex: number,
  timestamp: number,
): Promise<void> {
  let seq = startSeq;
  let entryStartIndex = startEntryIndex;
  for (const turn of turns) {
    const entryCount = await insertTurn(
      db,
      taleId,
      turn,
      seq,
      entryStartIndex,
      timestamp,
    );
    seq += 1;
    entryStartIndex += entryCount;
  }
}

async function insertFlatEntryTurns(
  db: Database,
  taleId: string,
  entries: LogEntry[],
  timestamp: number,
): Promise<void> {
  await insertTurns(
    db,
    taleId,
    sanitizeLogEntries(entries).map((entry, index) => ({
      entries: [entry],
      createdAt: timestamp + index,
    })),
    1,
    0,
    timestamp,
  );
}

async function replaceState(
  db: Database,
  taleId: string,
  state: TaleCurrentState,
  timestamp: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO tale_states (tale_id, state_json, state_schema_version, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tale_id) DO UPDATE SET
       state_json = excluded.state_json,
       state_schema_version = excluded.state_schema_version,
       updated_at = excluded.updated_at`,
    [taleId, JSON.stringify(state), TALE_STATE_SCHEMA_VERSION, timestamp],
  );
}

async function replaceSession(
  db: Database,
  taleId: string,
  session: TaleSessionState,
  timestamp: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO tale_sessions (tale_id, undo_stack_json, editor_state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tale_id) DO UPDATE SET
       undo_stack_json = excluded.undo_stack_json,
       editor_state_json = excluded.editor_state_json,
       updated_at = excluded.updated_at`,
    [
      taleId,
      JSON.stringify(sanitizeLogEntries(session.undoStack)),
      JSON.stringify(session.editorState),
      timestamp,
    ],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Create once with scenario; later updates do not require scenarioId.
export async function createTale(input: {
  scenarioId?: string;
  name: Tale["name"];
  description: Tale["description"];
  thumbnail?: Uint8Array | null;
  components: Tale["components"];
  storyCards: Tale["storyCards"];
  stats: Tale["stats"];
  inventory: Tale["inventory"];
  log: Tale["log"];
  gameMode: Tale["gameMode"];
  undoStack: Tale["undoStack"];
}): Promise<string> {
  const id = uuidv4();
  const now = Date.now();

  let scenarioId: string | undefined = undefined;
  if (input.scenarioId) {
    const scenario = await getScenario(input.scenarioId);
    scenarioId = scenario ? input.scenarioId : undefined;
  }

  const components = normalizePromptComponents(input.components);
  const log = sanitizeLogEntries(input.log);
  const undoStack = sanitizeLogEntries(input.undoStack);
  const metadata = {
    name: input.name,
    description: input.description,
    thumbnail: input.thumbnail ?? null,
    authorNote: getAuthorNote(components),
    scenarioId: scenarioId ?? null,
    gameMode: input.gameMode,
  };

  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.execute(
        `INSERT INTO tales (
        id,
        name,
        description,
        thumbnail_data,
        author_note,
        components,
        story_cards,
        scenario_id,
        stats,
        inventory,
        log,
        game_mode,
        undo_stack,
        save_version,
        schema_version,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          metadata.name,
          metadata.description,
          metadata.thumbnail,
          metadata.authorNote,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          metadata.scenarioId,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          metadata.gameMode,
          LEGACY_JSON_PLACEHOLDER,
          1,
          TALE_SCHEMA_VERSION,
          now,
          now,
        ],
      );

      await replaceState(
        db,
        id,
        createTaleCurrentState({
          components,
          storyCards: input.storyCards,
          stats: input.stats,
          inventory: input.inventory,
        }),
        now,
      );
      await insertFlatEntryTurns(db, id, log, now);
      await refreshTaleLogSummary(db, id);
      await replaceSession(db, id, createTaleSessionState({ undoStack }), now);
    });
  });

  return id;
}

export async function updateTaleMetadata(
  taleId: string,
  patch: Partial<Pick<Tale, "name" | "description" | "gameMode" | "thumbnail">>,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const current = await selectTaleRow(db, taleId);
    if (!current) throw new Error("Tale not found");

    const nextName = patch.name ?? current.name;
    const nextDescription = patch.description ?? current.description;
    const nextGameMode = patch.gameMode ?? current.game_mode;
    const nextThumbnail =
      "thumbnail" in patch ? (patch.thumbnail ?? null) : current.thumbnail_data;
    const now = Date.now();

    await db.execute(
      `UPDATE tales SET
         name = ?,
         description = ?,
         thumbnail_data = ?,
         game_mode = ?,
         updated_at = ?,
         save_version = save_version + 1
       WHERE id = ?`,
      [
        nextName,
        nextDescription,
        nextThumbnail ?? null,
        nextGameMode,
        now,
        taleId,
      ],
    );
  });
}

export async function replaceCurrentState(
  taleId: string,
  state: TaleCurrentState,
  session?: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      await replaceState(db, taleId, state, now);
      if (session) {
        await replaceSession(db, taleId, session, now);
      }
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function appendTurn(
  taleId: string,
  turn: Pick<TaleTurn, "entries" | "createdAt">,
  state: TaleCurrentState,
  session: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const nextSeq = (await selectTurnCount(db, taleId)) + 1;
      const entryStartIndex = await selectLogCount(db, taleId);
      await insertTurn(db, taleId, turn, nextSeq, entryStartIndex, now);
      await refreshTaleLogSummary(db, taleId);
      await replaceState(db, taleId, state, now);
      await replaceSession(db, taleId, session, now);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function replaceTurns(
  taleId: string,
  turns: TaleTurn[],
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      await db.execute(`DELETE FROM tale_turns WHERE tale_id = ?`, [taleId]);
      await insertTurns(db, taleId, turns, 1, 0, now);
      await refreshTaleLogSummary(db, taleId);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function replaceTurn(
  taleId: string,
  turnSeq: number,
  turn: Pick<TaleTurn, "entries" | "createdAt">,
  state: TaleCurrentState,
  session: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const rows = await db.select<TaleTurnRow[]>(
        `SELECT * FROM tale_turns WHERE tale_id = ? AND seq = ? LIMIT 1`,
        [taleId, turnSeq],
      );
      const existing = rows?.[0];
      if (!existing) throw new Error("Tale turn not found");

      await db.execute(`DELETE FROM tale_turns WHERE tale_id = ? AND seq = ?`, [
        taleId,
        turnSeq,
      ]);
      await insertTurn(
        db,
        taleId,
        turn,
        existing.seq,
        existing.entry_start_index,
        now,
      );
      await reindexTurns(db, taleId);
      await refreshTaleLogSummary(db, taleId);
      await replaceState(db, taleId, state, now);
      await replaceSession(db, taleId, session, now);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function replaceTurnContainingEntries(
  taleId: string,
  entryIds: string[],
  turn: Pick<TaleTurn, "entries" | "createdAt">,
  state: TaleCurrentState,
  session: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const requestedEntryIds = Array.from(new Set(entryIds));
      if (requestedEntryIds.length === 0) {
        throw new Error("Cannot replace tale turn without entry anchors");
      }

      const rows = await selectTurnRowsForEntryIds(
        db,
        taleId,
        requestedEntryIds,
      );
      if (rows.length === 0) throw new Error("Tale turn not found");

      const foundEntryIds = new Set(
        rows.flatMap((row) =>
          parseTurnEntries(row)
            .filter((entry) => requestedEntryIds.includes(entry.id))
            .map((entry) => entry.id),
        ),
      );
      const missingEntryIds = requestedEntryIds.filter(
        (entryId) => !foundEntryIds.has(entryId),
      );
      if (missingEntryIds.length > 0) {
        throw new Error("Tale turn not found for all requested entries");
      }

      const firstSeq = Math.min(...rows.map((row) => row.seq));
      const lastSeq = Math.max(...rows.map((row) => row.seq));
      const spanRows = await db.select<TaleTurnRow[]>(
        `SELECT * FROM tale_turns
         WHERE tale_id = ? AND seq BETWEEN ? AND ?
         ORDER BY seq ASC`,
        [taleId, firstSeq, lastSeq],
      );
      const matchedRowIds = new Set(rows.map((row) => row.id));
      const expectedSpanLength = lastSeq - firstSeq + 1;
      const isExactContiguousSpan =
        spanRows.length === expectedSpanLength &&
        spanRows.length === rows.length &&
        spanRows.every((row) => matchedRowIds.has(row.id));
      if (!isExactContiguousSpan) {
        throw new Error("Cannot replace a non-contiguous tale turn span");
      }

      const firstRow = spanRows[0];
      const shiftedSeq = (await selectTurnCount(db, taleId)) + 1;

      await db.execute(
        `UPDATE tale_turns SET seq = ? WHERE tale_id = ? AND seq = ?`,
        [shiftedSeq, taleId, firstSeq],
      );
      await db.execute(
        `DELETE FROM tale_turns WHERE tale_id = ? AND seq BETWEEN ? AND ?`,
        [taleId, firstSeq + 1, lastSeq],
      );
      await db.execute(`DELETE FROM tale_turns WHERE id = ?`, [firstRow.id]);
      await insertTurn(
        db,
        taleId,
        turn,
        firstSeq,
        firstRow.entry_start_index,
        now,
      );
      await reindexTurns(db, taleId);
      await refreshTaleLogSummary(db, taleId);
      await replaceState(db, taleId, state, now);
      await replaceSession(db, taleId, session, now);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function trimLogToEntryCount(
  taleId: string,
  entryCount: number,
  state: TaleCurrentState,
  session: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    const nextEntryCount = Math.max(0, entryCount);

    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const currentCount = await selectLogCount(db, taleId);
      if (nextEntryCount < currentCount) {
        const partialRows = await db.select<TaleTurnRow[]>(
          `SELECT *
           FROM tale_turns
           WHERE tale_id = ?
             AND entry_start_index < ?
             AND (entry_start_index + entry_count) > ?
           ORDER BY seq ASC
           LIMIT 1`,
          [taleId, nextEntryCount, nextEntryCount],
        );
        const partialRow = partialRows?.[0];

        await db.execute(
          `DELETE FROM tale_turns WHERE tale_id = ? AND entry_start_index >= ?`,
          [taleId, nextEntryCount],
        );

        if (partialRow) {
          const keepCount = nextEntryCount - partialRow.entry_start_index;
          if (keepCount <= 0) {
            await db.execute(`DELETE FROM tale_turns WHERE id = ?`, [
              partialRow.id,
            ]);
          } else {
            const entries = sanitizeTurnEntries(
              parseTurnEntries(partialRow).slice(0, keepCount),
            );
            await db.execute(
              `UPDATE tale_turns
               SET entries_json = ?, entry_count = ?, updated_at = ?
               WHERE id = ?`,
              [JSON.stringify(entries), entries.length, now, partialRow.id],
            );
          }
        }

        await reindexTurns(db, taleId);
      }

      await refreshTaleLogSummary(db, taleId);
      await replaceState(db, taleId, state, now);
      await replaceSession(db, taleId, session, now);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function updateLogEntry(
  taleId: string,
  entryId: string,
  patch: LogEntryPatch,
  state?: TaleCurrentState,
  session?: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const rows = await selectTurnRowsForEntryIds(db, taleId, [entryId]);
      const row = rows[0];
      if (!row) throw new Error("Tale log entry not found");

      const entries = sanitizeTurnEntries(
        parseTurnEntries(row).map((entry) =>
          entry.id === entryId ? { ...entry, ...patch } : entry,
        ),
      );
      await db.execute(
        `UPDATE tale_turns
         SET entries_json = ?, entry_count = ?, updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(entries), entries.length, now, row.id],
      );
      await refreshTaleLogSummary(db, taleId);

      if (state) {
        await replaceState(db, taleId, state, now);
      }
      if (session) {
        await replaceSession(db, taleId, session, now);
      }
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function replaceLogEntryInTurn(
  taleId: string,
  entryId: string,
  replacementEntry: LogEntry,
  state: TaleCurrentState,
  session: TaleSessionState,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const now = Date.now();
    await withTransaction(db, async () => {
      await requireTaleRow(db, taleId);
      const rows = await selectTurnRowsForEntryIds(db, taleId, [entryId]);
      if (rows.length !== 1) {
        throw new Error("Tale log entry turn not found");
      }

      const row = rows[0];
      const rowEntries = parseTurnEntries(row);
      const matchingEntries = rowEntries.filter(
        (entry) => entry.id === entryId,
      );
      if (matchingEntries.length !== 1) {
        throw new Error("Tale log entry is not unique within its turn");
      }

      const cleanReplacement = sanitizeLogEntries([replacementEntry])[0];
      const entries = sanitizeTurnEntries(
        rowEntries.map((entry) =>
          entry.id === entryId ? cleanReplacement : entry,
        ),
      );
      await db.execute(
        `UPDATE tale_turns
         SET entries_json = ?, entry_count = ?, updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(entries), entries.length, now, row.id],
      );
      await refreshTaleLogSummary(db, taleId);
      await replaceState(db, taleId, state, now);
      await replaceSession(db, taleId, session, now);
      await db.execute(
        `UPDATE tales SET updated_at = ?, save_version = save_version + 1 WHERE id = ?`,
        [now, taleId],
      );
    });
  });
}

export async function updateTaleCurrentData(
  input: TaleCurrentDataInput,
): Promise<void> {
  const now = input.updatedAt ?? Date.now();
  const components = normalizePromptComponents(input.components);
  const state = createTaleCurrentState({
    components,
    storyCards: input.storyCards,
    stats: input.stats,
    inventory: input.inventory,
  });

  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await withTransaction(db, async () => {
      await requireTaleRow(db, input.id);
      await db.execute(
        `UPDATE tales SET
           name = ?,
           description = ?,
           author_note = ?,
           game_mode = ?,
           updated_at = ?,
           save_version = save_version + 1
         WHERE id = ?`,
        [
          input.name,
          input.description,
          getAuthorNote(components),
          input.gameMode,
          now,
          input.id,
        ],
      );
      await replaceState(db, input.id, state, now);
      await replaceSession(
        db,
        input.id,
        createTaleSessionState({ undoStack: input.undoStack }),
        now,
      );
    });
  });
}

export async function getCurrentState(
  taleId: string,
): Promise<TaleCurrentState | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      const row = await selectTaleRow(db, taleId);
      if (!row) return null;
      return parseStateRow(
        await selectStateRow(db, taleId),
        legacyStateFromRow(row),
      );
    });
  });
}

async function selectTaleAggregate(
  db: Database,
  id: string,
  options: { logStart?: number; logLimit?: number } = {},
): Promise<Tale | null> {
  const row = await selectTaleRow(db, id);
  if (!row) return null;

  const state = parseStateRow(
    await selectStateRow(db, id),
    legacyStateFromRow(row),
  );
  const log =
    options.logStart !== undefined && options.logLimit !== undefined
      ? await selectLogEntries(db, id, options.logStart, options.logLimit)
      : await selectLogEntries(db, id, 0, await selectLogCount(db, id));
  const undoStack = await selectSessionUndoStack(db, id, row);

  return toTale(row, state, log, undoStack);
}

async function selectTalePlayLoad(
  db: Database,
  id: string,
  options: { logStart: number; logLimit: number },
): Promise<TalePlayLoad | null> {
  const row = await selectTaleRow(db, id);
  if (!row) return null;

  const totalLogCount = await selectLogCount(db, id);
  const startIndex = Math.max(0, Math.min(options.logStart, totalLogCount));
  const logLimit = Math.max(0, options.logLimit);
  const state = parseStateRow(
    await selectStateRow(db, id),
    legacyStateFromRow(row),
  );
  const log = await selectLogEntries(db, id, startIndex, logLimit);
  const undoStack = await selectSessionUndoStack(db, id, row);

  return {
    ...toTale(row, state, log, undoStack),
    totalLogCount,
    oldestLoadedIndex: startIndex,
  };
}

export async function getTale(id: string): Promise<Tale | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, () => selectTaleAggregate(db, id));
  });
}

export async function getTalePlayLoad(
  id: string,
  options: { logStart?: number; logLimit: number },
): Promise<TalePlayLoad | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      if (options.logStart !== undefined) {
        return selectTalePlayLoad(db, id, {
          logStart: options.logStart,
          logLimit: options.logLimit,
        });
      }

      const totalLogCount = await selectLogCount(db, id);
      return selectTalePlayLoad(db, id, {
        logStart: Math.max(0, totalLogCount - options.logLimit),
        logLimit: options.logLimit,
      });
    });
  });
}

export async function listTalesForScenario(
  scenarioId: string,
): Promise<Tale[]> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      const rows = await db.select<TaleRow[]>(
        `SELECT * FROM tales WHERE scenario_id = ? ORDER BY created_at DESC`,
        [scenarioId],
      );
      const tales: Tale[] = [];
      for (const row of rows) {
        const tale = await selectTaleAggregate(db, row.id);
        if (tale) tales.push(tale);
      }
      return tales;
    });
  });
}

type TaleHeadRow = {
  id: string;
  name: string;
  description: string;
  thumbnail_data?: Uint8Array | null;
  created_at: number;
  scenario_id: string | null;
  updated_at: number;
  log_count: number;
  last_log_entry: string | null;
};

async function mapTaleHeadRow(r: TaleHeadRow): Promise<TaleHead> {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    thumbnail: toUint8Array(r.thumbnail_data ?? null),
    logCount: r.log_count,
    lastLogEntry: parseJsonValue<LogEntry>(r.last_log_entry),
    createdAt: r.created_at,
    scenarioId: r.scenario_id,
    updatedAt: r.updated_at,
    ...(r.scenario_id
      ? { scenarioHead: await getScenarioHead(r.scenario_id) }
      : { scenarioHead: undefined }),
  };
}

function taleHeadSelect(whereClause = ""): string {
  return `SELECT
      t.id,
      t.name,
      t.description,
      t.thumbnail_data,
      t.created_at,
      t.scenario_id,
      t.updated_at,
      CASE
        WHEN ts.tale_id IS NULL AND json_valid(t.log)
          THEN COALESCE(json_array_length(t.log), 0)
        WHEN ts.tale_id IS NULL THEN 0
        ELSE COALESCE(t.log_count, 0)
      END AS log_count,
      CASE
        WHEN ts.tale_id IS NULL
          AND json_valid(t.log)
          AND json_array_length(t.log) > 0
          THEN json_extract(t.log, '$[' || (json_array_length(t.log) - 1) || ']')
        WHEN ts.tale_id IS NOT NULL
          THEN t.last_log_entry_json
        ELSE NULL
      END AS last_log_entry
    FROM tales t
    LEFT JOIN tale_states ts ON ts.tale_id = t.id
    ${whereClause}`;
}

export async function getTales(
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      const rows = await db.select<TaleHeadRow[]>(
        `${taleHeadSelect()}
        ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
        [limit, (page - 1) * limit],
      );
      const countRows = await db.select<Array<{ count: number }>>(
        `SELECT COUNT(*) as count FROM tales`,
      );
      const total = countRows?.[0]?.count ?? 0;
      const data: TaleHead[] = [];
      for (const row of rows) {
        data.push(await mapTaleHeadRow(row));
      }
      return {
        data,
        total,
        page,
        limit,
      };
    });
  });
}

export async function getScenarioTales(
  scenarioId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      const rows = await db.select<TaleHeadRow[]>(
        `${taleHeadSelect("WHERE t.scenario_id = ?")}
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
        [scenarioId, limit, (page - 1) * limit],
      );
      const countRows = await db.select<Array<{ count: number }>>(
        `SELECT COUNT(*) as count FROM tales WHERE scenario_id = ?`,
        [scenarioId],
      );
      const total = countRows?.[0]?.count ?? 0;
      const data: TaleHead[] = [];
      for (const row of rows) {
        data.push(await mapTaleHeadRow(row));
      }
      return {
        data,
        total,
        page,
        limit,
      };
    });
  });
}

export async function deleteTale(id: string): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.execute(`DELETE FROM tale_sessions WHERE tale_id = ?`, [id]);
      await db.execute(`DELETE FROM tale_turns WHERE tale_id = ?`, [id]);
      await db.execute(`DELETE FROM tale_states WHERE tale_id = ?`, [id]);
      await db.execute(`DELETE FROM tales WHERE id = ?`, [id]);
    });
  });
}

export async function linkTaleToScenario(
  taleId: string,
  scenarioId: string,
): Promise<void> {
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE tales
       SET scenario_id = ?, updated_at = ?, save_version = save_version + 1
       WHERE id = ?`,
      [scenarioId, Date.now(), taleId],
    );
  });
}

export async function getLogEntries(
  taleId: string,
  startIndex: number,
  limit: number,
): Promise<LogEntry[]> {
  try {
    return await enqueueLocalOperation(async () => {
      const db = await getDb();
      return withReadTransaction(db, () =>
        selectLogEntries(db, taleId, startIndex, limit),
      );
    });
  } catch (error) {
    console.error("Error fetching log entries:", error);
    return [];
  }
}

export async function getLogEntriesReverse(
  taleId: string,
  fromEnd: number,
  limit: number,
): Promise<LogEntry[]> {
  if (fromEnd < 0 || limit <= 0) {
    return [];
  }

  try {
    return await enqueueLocalOperation(async () => {
      const db = await getDb();
      return withReadTransaction(db, async () => {
        const count = await selectLogCount(db, taleId);
        const startIndex = Math.max(0, count - fromEnd - limit);
        const endIndex = count - fromEnd;
        if (startIndex >= count || endIndex <= 0) return [];
        return selectLogEntries(db, taleId, startIndex, endIndex - startIndex);
      });
    });
  } catch (error) {
    console.error("Error fetching log entries reverse:", error);
    return [];
  }
}

export async function getLogCount(taleId: string): Promise<number> {
  try {
    return await enqueueLocalOperation(async () => {
      const db = await getDb();
      return withReadTransaction(db, () => selectLogCount(db, taleId));
    });
  } catch (error) {
    console.error("Error fetching log count:", error);
    return 0;
  }
}

export async function exportTalePackage(
  taleId: string,
): Promise<TalePackageV1> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withReadTransaction(db, async () => {
      const row = await selectTaleRow(db, taleId);
      if (!row) throw new Error("Tale not found");

      const stateRow = await selectStateRow(db, taleId);
      const state = parseStateRow(stateRow, legacyStateFromRow(row));
      const splitStorage = await hasSplitStorage(db, taleId);
      const turnRows = await db.select<TaleTurnRow[]>(
        `SELECT * FROM tale_turns WHERE tale_id = ? ORDER BY seq ASC`,
        [taleId],
      );
      const turns = splitStorage
        ? turnRows.map((turn) => ({
            id: turn.id,
            seq: turn.seq,
            createdAt: turn.created_at,
            updatedAt: turn.updated_at,
            entries: sanitizeLogEntries(parseTurnEntries(turn)),
          }))
        : (parseJsonValue<LogEntry[]>(row.log) ?? []).map((entry, index) => ({
            id: uuidv4(),
            seq: index + 1,
            createdAt: row.created_at + index,
            updatedAt: row.updated_at,
            entries: sanitizeLogEntries([entry]),
          }));

      const thumbnail = toUint8Array(row.thumbnail_data ?? null);
      const thumbnailAssetId = thumbnail ? "thumbnail" : undefined;
      const gameMode =
        row.game_mode === GameMode.STORY_TELLER
          ? GameMode.STORY_TELLER
          : GameMode.GM;

      return {
        format: "hakawati-tale-package",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        tale: {
          id: row.id,
          title: row.name,
          description: row.description,
          gameMode,
          ...(thumbnailAssetId ? { thumbnailAssetId } : {}),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          schemaVersion: row.schema_version ?? TALE_SCHEMA_VERSION,
        },
        state: {
          stateSchemaVersion:
            stateRow?.state_schema_version ?? TALE_STATE_SCHEMA_VERSION,
          data: state,
        },
        turns,
        assets: thumbnail
          ? [
              {
                id: thumbnailAssetId ?? "thumbnail",
                role: "thumbnail",
                contentType: "application/octet-stream",
                dataBase64: bytesToBase64(thumbnail),
              },
            ]
          : [],
      };
    });
  });
}

export async function importTalePackage(
  input: TalePackageV1,
  options: { preserveId?: boolean; title?: string } = {},
): Promise<string> {
  const payload = TalePackageV1Schema.parse(input) as TalePackageV1;
  const turnIds = new Set<string>();
  const entryIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const asset of payload.assets) {
    if (assetIds.has(asset.id)) {
      throw new Error("Tale package assets must have unique ids");
    }
    assetIds.add(asset.id);
  }

  if (
    payload.tale.thumbnailAssetId &&
    !assetIds.has(payload.tale.thumbnailAssetId)
  ) {
    throw new Error("Tale package thumbnail asset is missing");
  }

  payload.turns.forEach((turn, index) => {
    if (turn.seq !== index + 1) {
      throw new Error("Tale package turns must be contiguous from sequence 1");
    }
    if (turnIds.has(turn.id)) {
      throw new Error("Tale package turns must have unique ids");
    }
    turnIds.add(turn.id);

    const cleanEntries = sanitizeTurnEntries(turn.entries);
    for (const entry of cleanEntries) {
      if (entryIds.has(entry.id)) {
        throw new Error("Tale package log entries must have unique ids");
      }
      entryIds.add(entry.id);
    }
  });

  const requestedId = options.preserveId ? payload.tale.id : uuidv4();
  let taleId = requestedId;
  const now = Date.now();
  const thumbnailAsset = payload.assets.find(
    (asset) => asset.id === payload.tale.thumbnailAssetId,
  );
  const thumbnail = thumbnailAsset
    ? base64ToBytes(thumbnailAsset.dataBase64)
    : null;
  const state = createTaleCurrentState({
    components: normalizePromptComponents(payload.state.data.components),
    storyCards: payload.state.data.storyCards.map(normalizeStoryCard),
    stats: payload.state.data.gm.stats.map((stat) => ({
      ...stat,
      range: [stat.range[0] ?? 0, stat.range[1] ?? 100],
    })),
    inventory: payload.state.data.gm.inventory,
    scratchpad: payload.state.data.gm.scratchpad,
  });
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    const existing = await selectTaleRow(db, requestedId);
    taleId = existing ? uuidv4() : requestedId;

    await withTransaction(db, async () => {
      await db.execute(
        `INSERT INTO tales (
        id,
        name,
        description,
        thumbnail_data,
        author_note,
        components,
        story_cards,
        scenario_id,
        stats,
        inventory,
        log,
        game_mode,
        undo_stack,
        save_version,
        schema_version,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, '[]', 1, ?, ?, ?)`,
        [
          taleId,
          options.title ?? payload.tale.title,
          payload.tale.description,
          thumbnail,
          getAuthorNote(state.components),
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          LEGACY_JSON_PLACEHOLDER,
          payload.tale.gameMode,
          payload.tale.schemaVersion,
          now,
          now,
        ],
      );
      await replaceState(db, taleId, state, now);
      await insertTurns(
        db,
        taleId,
        payload.turns.map((turn) => ({
          entries: turn.entries,
          createdAt: turn.createdAt,
        })),
        1,
        0,
        now,
      );
      await refreshTaleLogSummary(db, taleId);
      await replaceSession(db, taleId, createTaleSessionState(), now);
    });
  });

  return taleId;
}
