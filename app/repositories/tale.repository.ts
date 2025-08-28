import { getDb } from "@/services/db";
import { nanoid } from "nanoid";
import { Tale, TaleHead } from "@/types/tale.type";
import { GameMode } from "@/types/context.type";
import { PaginatedResponse, TaleRow } from "@/types/db.type";
import { getScenario, getScenarioHead } from "./scenario.repository";

function toRow(s: Tale): TaleRow {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
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

function fromRow(r: TaleRow): Tale {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    authorNote: r.author_note,
    storyCards: JSON.parse(r.story_cards),
    scenarioId: r.scenario_id ?? null,
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
  scenarioId: string;
  name: Tale["name"];
  description: Tale["description"];
  authorNote: Tale["authorNote"];
  storyCards: Tale["storyCards"];
  stats: Tale["stats"];
  inventory: Tale["inventory"];
  log: Tale["log"];
  gameMode: Tale["gameMode"];
  undoStack: Tale["undoStack"];
}): Promise<string> {
  const db = await getDb();
  const id = nanoid(12);

  const scenario = await getScenario(input.scenarioId);
  const scenarioId: string | null = scenario ? input.scenarioId : null;

  const row = toRow({
    id,
    name: input.name,
    description: input.description,
    authorNote: input.authorNote,
    storyCards: input.storyCards,
    scenarioId,
    stats: input.stats,
    inventory: input.inventory,
    log: input.log,
    gameMode: input.gameMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    undoStack: input.undoStack,
  });

  await db.execute(
    `INSERT INTO tales (id, name, description, author_note, story_cards, scenario_id, stats, inventory, log, game_mode, undo_stack, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name,
      row.description,
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
      created_at: number;
      scenario_id: string | null;
      updated_at: number;
      log_count: number;
    }>
  >(
    `SELECT 
      id,
      name,
      description,
      created_at,
      scenario_id,
      updated_at,
      json_array_length(log) AS log_count
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
        logCount: r.log_count,
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
      created_at: number;
      scenario_id: string | null;
      updated_at: number;
      log_count: number;
    }>
  >(
    `SELECT 
      id,
      name,
      description,
      created_at,
      scenario_id,
      updated_at,
      json_array_length(log) AS log_count
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
        logCount: r.log_count,
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
