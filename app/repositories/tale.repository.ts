import { getDb } from "@/services/db";
import { Tale, TaleHead } from "@/types/tale.type";
import { LogEntry } from "@/types/log.type";
import { GameMode } from "@/types/context.type";
import { PaginatedResponse, TaleRow } from "@/types/db.type";
import { getScenario, getScenarioHead } from "./scenario.repository";
import { v4 as uuidv4 } from "uuid";

function toRow(s: Tale): TaleRow {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    thumbnail_data: s.thumbnail ?? null,
    author_note: s.authorNote,
    story_cards: JSON.stringify(s.storyCards),
    scenario_id: s.scenarioId ?? null,
    stats: JSON.stringify(s.stats),
    inventory: JSON.stringify(s.inventory),
    log: JSON.stringify(s.log),
    game_mode: s.gameMode,
    undo_stack: JSON.stringify(s.undoStack),
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) return new Uint8Array(arr as number[]);
      } catch (_e) {
        return null;
      }
    }
    return null;
  }
  return null;
}

function parseJsonValue<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (_error) {
    return null;
  }
}

function fromRow(r: TaleRow): Tale {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    thumbnail: toUint8Array(r.thumbnail_data ?? null),
    authorNote: r.author_note,
    storyCards: JSON.parse(r.story_cards),
    scenarioId: r.scenario_id ?? undefined,
    stats: JSON.parse(r.stats),
    inventory: JSON.parse(r.inventory),
    log: JSON.parse(r.log),
    undoStack: JSON.parse(r.undo_stack),
    gameMode:
      r.game_mode === GameMode.STORY_TELLER
        ? GameMode.STORY_TELLER
        : GameMode.GM,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Create once with scenario; later updates do not require scenarioId.
export async function createTale(input: {
  scenarioId?: string;
  name: Tale["name"];
  description: Tale["description"];
  thumbnail?: Uint8Array | null;
  authorNote: Tale["authorNote"];
  storyCards: Tale["storyCards"];
  stats: Tale["stats"];
  inventory: Tale["inventory"];
  log: Tale["log"];
  gameMode: Tale["gameMode"];
  undoStack: Tale["undoStack"];
}): Promise<string> {
  const db = await getDb();
  const id = uuidv4();

  let scenarioId: string | undefined = undefined;
  if (input.scenarioId) {
    const scenario = await getScenario(input.scenarioId);
    scenarioId = scenario ? input.scenarioId : undefined;
  }

  const row = toRow({
    id,
    name: input.name,
    description: input.description,
    thumbnail: input.thumbnail ?? null,
    authorNote: input.authorNote,
    storyCards: input.storyCards,
    scenarioId: scenarioId ?? undefined,
    stats: input.stats,
    inventory: input.inventory,
    log: input.log,
    gameMode: input.gameMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    undoStack: input.undoStack,
  });

  await db.execute(
    `INSERT INTO tales (id, name, description, thumbnail_data, author_note, story_cards, scenario_id, stats, inventory, log, game_mode, undo_stack, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name,
      row.description,
      row.thumbnail_data ?? null,
      row.author_note,
      row.story_cards,
      row.scenario_id,
      row.stats,
      row.inventory,
      row.log,
      row.game_mode,
      row.undo_stack,
      row.created_at,
      row.updated_at,
    ],
  );

  return id;
}

export async function updateTale(input: {
  id: string;
  name: Tale["name"];
  description: Tale["description"];
  authorNote: Tale["authorNote"];
  storyCards: Tale["storyCards"];
  stats: Tale["stats"];
  inventory: Tale["inventory"];
  log: Tale["log"];
  gameMode: Tale["gameMode"];
  undoStack: Tale["undoStack"];
  updatedAt: Tale["updatedAt"];
}): Promise<void> {
  const db = await getDb();

  await db.execute(
    `UPDATE tales SET
       name = ?,
       description = ?,
       author_note = ?,
       story_cards = ?,
       stats = ?,
       inventory = ?,
       log = ?,
       game_mode = ?,
       undo_stack = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.description,
      input.authorNote,
      JSON.stringify(input.storyCards),
      JSON.stringify(input.stats),
      JSON.stringify(input.inventory),
      JSON.stringify(input.log),
      input.gameMode,
      JSON.stringify(input.undoStack),
      input.updatedAt,
      input.id,
    ],
  );
}

export async function getTale(id: string): Promise<Tale | null> {
  const db = await getDb();
  const rows = await db.select<TaleRow[]>(
    `SELECT * FROM tales WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows || rows.length === 0) return null;
  return fromRow(rows[0]);
}

export async function listTalesForScenario(
  scenarioId: string,
): Promise<Tale[]> {
  const db = await getDb();
  const rows = await db.select<TaleRow[]>(
    `SELECT * FROM tales WHERE scenario_id = ? ORDER BY created_at DESC`,
    [scenarioId],
  );
  return rows.map(fromRow);
}

export async function getTales(
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      name: string;
      description: string;
      thumbnail_data?: Uint8Array | null;
      created_at: number;
      scenario_id: string | null;
      updated_at: number;
      log_count: number;
      last_log_entry: string | null;
    }>
  >(
    `SELECT 
      id,
      name,
      description,
      thumbnail_data,
      created_at,
      scenario_id,
      updated_at,
      json_array_length(log) AS log_count,
      CASE
        WHEN json_array_length(log) > 0
          THEN json_extract(log, '$[' || (json_array_length(log) - 1) || ']')
        ELSE NULL
      END AS last_log_entry
    FROM tales 
    ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, (page - 1) * limit],
  );
  const countRows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM tales`,
  );
  const total = countRows?.[0]?.count ?? 0;
  return {
    data: await Promise.all(
      rows.map(async (r) => ({
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
      })),
    ),
    total,
    page,
    limit,
  };
}

export async function getScenarioTales(
  scenarioId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      name: string;
      description: string;
      thumbnail_data?: Uint8Array | null;
      created_at: number;
      scenario_id: string | null;
      updated_at: number;
      log_count: number;
      last_log_entry: string | null;
    }>
  >(
    `SELECT 
      id,
      name,
      description,
      thumbnail_data,
      created_at,
      scenario_id,
      updated_at,
      json_array_length(log) AS log_count,
      CASE
        WHEN json_array_length(log) > 0
          THEN json_extract(log, '$[' || (json_array_length(log) - 1) || ']')
        ELSE NULL
      END AS last_log_entry
    FROM tales 
    WHERE scenario_id = ? 
    ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [scenarioId, limit, (page - 1) * limit],
  );
  const countRows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM tales WHERE scenario_id = ?`,
    [scenarioId],
  );
  const total = countRows?.[0]?.count ?? 0;
  return {
    data: await Promise.all(
      rows.map(async (r) => ({
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
      })),
    ),
    total,
    page,
    limit,
  };
}

export async function deleteTale(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM tales WHERE id = ?`, [id]);
}

/**
 * Get a range of log entries by index
 * @param taleId - The tale ID
 * @param startIndex - Starting index (0-based)
 * @param limit - Maximum number of entries to return
 * @returns Array of log entries in the specified range
 */
export async function getLogEntries(
  taleId: string,
  startIndex: number,
  limit: number,
): Promise<LogEntry[]> {
  const db = await getDb();

  if (startIndex < 0 || limit <= 0) {
    return [];
  }

  try {
    const rows = await db.select<Array<{ log: string }>>(
      `SELECT log FROM tales WHERE id = ? LIMIT 1`,
      [taleId],
    );

    if (!rows || rows.length === 0) {
      return [];
    }

    const fullLog: LogEntry[] = JSON.parse(rows[0].log);

    if (!fullLog || !Array.isArray(fullLog) || fullLog.length === 0) {
      return [];
    }

    if (startIndex >= fullLog.length) {
      return [];
    }

    const endIndex = Math.min(startIndex + limit, fullLog.length);
    return fullLog.slice(startIndex, endIndex);
  } catch (error) {
    console.error("Error fetching log entries:", error);
    return [];
  }
}

/**
 * Get log entries from the end (most recent entries)
 * @param taleId - The tale ID
 * @param fromEnd - Number of entries to skip from the end (0 = include last entry)
 * @param limit - Maximum number of entries to return
 * @returns Array of log entries
 */
export async function getLogEntriesReverse(
  taleId: string,
  fromEnd: number,
  limit: number,
): Promise<LogEntry[]> {
  const db = await getDb();

  if (fromEnd < 0 || limit <= 0) {
    return [];
  }

  try {
    const rows = await db.select<Array<{ log: string }>>(
      `SELECT log FROM tales WHERE id = ? LIMIT 1`,
      [taleId],
    );

    if (!rows || rows.length === 0) {
      return [];
    }

    const fullLog: LogEntry[] = JSON.parse(rows[0].log);

    if (!fullLog || !Array.isArray(fullLog) || fullLog.length === 0) {
      return [];
    }

    const startIndex = Math.max(0, fullLog.length - fromEnd - limit);
    const endIndex = fullLog.length - fromEnd;

    if (startIndex >= fullLog.length || endIndex <= 0) {
      return [];
    }

    return fullLog.slice(startIndex, endIndex);
  } catch (error) {
    console.error("Error fetching log entries reverse:", error);
    return [];
  }
}

/**
 * Get the total count of log entries for a tale
 * @param taleId - The tale ID
 * @returns Total number of log entries
 */
export async function getLogCount(taleId: string): Promise<number> {
  const db = await getDb();

  try {
    const rows = await db.select<Array<{ count: number }>>(
      `SELECT json_array_length(log) as count FROM tales WHERE id = ? LIMIT 1`,
      [taleId],
    );

    if (!rows || rows.length === 0) {
      return 0;
    }

    return rows[0].count ?? 0;
  } catch (error) {
    console.error("Error fetching log count:", error);
    return 0;
  }
}
