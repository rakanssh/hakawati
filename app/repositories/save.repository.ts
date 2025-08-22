import { getDb } from "@/services/db";
import { nanoid } from "nanoid";
import { Save, SaveHead } from "@/types/save.type";
import { GameMode } from "@/types/context.type";
import { PaginatedResponse, SaveRow } from "@/types/db.type";
import { getScenario } from "./scenario.repository";

function toRow(s: Save): SaveRow {
  return {
    id: s.id,
    scenario_id: s.scenarioId ?? null,
    save_name: s.saveName,
    stats: JSON.stringify(s.stats),
    inventory: JSON.stringify(s.inventory),
    log: JSON.stringify(s.log),
    game_mode: s.gameMode,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function fromRow(r: SaveRow): Save {
  return {
    id: r.id,
    scenarioId: r.scenario_id ?? null,
    saveName: r.save_name,
    stats: JSON.parse(r.stats),
    inventory: JSON.parse(r.inventory),
    log: JSON.parse(r.log),
    gameMode:
      r.game_mode === GameMode.STORY_TELLER
        ? GameMode.STORY_TELLER
        : GameMode.GM,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Create once with scenario; later updates do not require scenarioId.
export async function createSave(input: {
  scenarioId: string;
  saveName: string;
  stats: Save["stats"];
  inventory: Save["inventory"];
  log: Save["log"];
  gameMode: Save["gameMode"];
}): Promise<string> {
  const db = await getDb();
  const id = nanoid(12);

  const scenario = await getScenario(input.scenarioId);
  const scenarioId: string | null = scenario ? input.scenarioId : null;

  const row = toRow({
    id,
    scenarioId,
    saveName: input.saveName,
    stats: input.stats,
    inventory: input.inventory,
    log: input.log,
    gameMode: input.gameMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await db.execute(
    `INSERT INTO saves (id, scenario_id, save_name, stats, inventory, log, game_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.scenario_id,
      row.save_name,
      row.stats,
      row.inventory,
      row.log,
      row.game_mode,
      row.created_at,
      row.updated_at,
    ],
  );

  return id;
}

export async function updateSave(input: {
  id: string;
  saveName: string;
  stats: Save["stats"];
  inventory: Save["inventory"];
  log: Save["log"];
  gameMode: Save["gameMode"];
}): Promise<void> {
  const db = await getDb();

  await db.execute(
    `UPDATE saves SET
       save_name = ?,
       stats = ?,
       inventory = ?,
       log = ?,
       game_mode = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      input.saveName,
      JSON.stringify(input.stats),
      JSON.stringify(input.inventory),
      JSON.stringify(input.log),
      input.gameMode,
      Date.now(),
      input.id,
    ],
  );
}

export async function getSave(id: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select<SaveRow[]>(
    `SELECT * FROM saves WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows || rows.length === 0) return null;
  return fromRow(rows[0]);
}

export async function listSavesForScenario(
  scenarioId: string,
): Promise<Save[]> {
  const db = await getDb();
  const rows = await db.select<SaveRow[]>(
    `SELECT * FROM saves WHERE scenario_id = ? ORDER BY created_at DESC`,
    [scenarioId],
  );
  return rows.map(fromRow);
}

export async function deleteSave(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM saves WHERE id = ?`, [id]);
}

export async function getSaves(
  page: number,
  limit: number,
): Promise<PaginatedResponse<SaveHead>> {
  const db = await getDb();
  const rows = await db.select<SaveRow[]>(
    `SELECT 
      id,
      save_name,
      created_at,
      scenario_id,
      updated_at
    FROM saves 
    ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, (page - 1) * limit],
  );
  return {
    data: rows.map((r: SaveRow) => ({
      id: r.id,
      saveName: r.save_name,
      createdAt: r.created_at,
      scenarioId: r.scenario_id,
      updatedAt: r.updated_at,
    })),
    total: rows.length,
    page,
    limit,
  };
}

export async function getScenarioSaves(
  scenarioId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<SaveHead>> {
  const db = await getDb();
  const rows = await db.select<SaveRow[]>(
    `SELECT 
      id,
      save_name,
      created_at,
      scenario_id,
      updated_at
    FROM saves 
    WHERE scenario_id = ? 
    ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [scenarioId, limit, (page - 1) * limit],
  );
  return {
    data: rows.map((r: SaveRow) => ({
      id: r.id,
      saveName: r.save_name,
      createdAt: r.created_at,
      scenarioId: r.scenario_id,
      updatedAt: r.updated_at,
    })),
    total: rows.length,
    page,
    limit,
  };
}
