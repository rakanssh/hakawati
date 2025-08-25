import { getDb } from "@/services/db";
import { nanoid } from "nanoid";
import { Save } from "@/types/save.type";
import { SaveRow } from "@/types/db.type";
import { getScenario } from "./scenario.repository";

function toRow(s: Save): SaveRow {
  return {
    id: s.id,
    scenario_id: s.scenarioId,
    save_name: s.saveName,
    stats: JSON.stringify(s.stats),
    inventory: JSON.stringify(s.inventory),
    log: JSON.stringify(s.log),
    created_at: s.createdAt,
  };
}

function fromRow(r: SaveRow): Save {
  return {
    id: r.id,
    scenarioId: r.scenario_id,
    saveName: r.save_name,
    stats: JSON.parse(r.stats),
    inventory: JSON.parse(r.inventory),
    log: JSON.parse(r.log),
    createdAt: r.created_at,
  };
}

export async function createSave(
  input: Omit<Save, "id" | "createdAt">,
): Promise<string> {
  const db = await getDb();
  const id = nanoid(12);
  const row = toRow({ ...input, id, createdAt: Date.now() });

  const scenario = await getScenario(input.scenarioId);

  if (!scenario) {
    await db.execute(
      `INSERT INTO saves (id, save_name, stats, inventory, log, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.save_name,
        row.stats,
        row.inventory,
        row.log,
        row.created_at,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO saves (id, scenario_id, save_name, stats, inventory, log, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.scenario_id,
        row.save_name,
        row.stats,
        row.inventory,
        row.log,
        row.created_at,
      ],
    );
  }
  return id;
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
