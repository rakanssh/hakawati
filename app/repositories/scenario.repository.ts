import { getDb } from "@/services/db";
import { nanoid } from "nanoid";
import { Scenario, ScenarioHead } from "@/types/context.type";
import { ScenarioRow, PaginatedResponse } from "@/types/db.type";

function toRow(id: string, s: Scenario, ts: number): ScenarioRow {
  return {
    id,
    name: s.name,
    initial_description: s.initialDescription,
    initial_author_note: s.initialAuthorNote,
    initial_stats: JSON.stringify(s.initialStats),
    initial_inventory: JSON.stringify(s.initialInventory),
    initial_story_cards: JSON.stringify(s.initialStoryCards),
    created_at: ts,
    updated_at: ts,
  };
}

function fromRow(r: ScenarioRow): Scenario {
  return {
    id: r.id,
    name: r.name,
    initialDescription: r.initial_description,
    initialAuthorNote: r.initial_author_note,
    initialStats: JSON.parse(r.initial_stats),
    initialInventory: JSON.parse(r.initial_inventory),
    initialStoryCards: JSON.parse(r.initial_story_cards),
  };
}

export async function upsertScenario(
  input: Scenario,
  id?: string,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const scenarioId = id ?? nanoid(12);
  const row = toRow(scenarioId, input, now);
  await db.execute(
    `INSERT INTO scenarios (id, name, initial_description, initial_author_note, initial_stats, initial_inventory, initial_story_cards, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       initial_description=excluded.initial_description,
       initial_author_note=excluded.initial_author_note,
       initial_stats=excluded.initial_stats,
       initial_inventory=excluded.initial_inventory,
       initial_story_cards=excluded.initial_story_cards,
       updated_at=excluded.updated_at`,
    [
      row.id,
      row.name,
      row.initial_description,
      row.initial_author_note,
      row.initial_stats,
      row.initial_inventory,
      row.initial_story_cards,
      row.created_at,
      row.updated_at,
    ],
  );
  return scenarioId;
}

export async function getScenario(id: string): Promise<Scenario | null> {
  const db = await getDb();
  const rows = await db.select<ScenarioRow[]>(
    `SELECT * FROM scenarios WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows || rows.length === 0) return null;
  return fromRow(rows[0]);
}

export async function listScenarios(): Promise<
  Array<{ id: string; scenario: Scenario; updatedAt: number }>
> {
  const db = await getDb();
  const rows = await db.select<ScenarioRow[]>(
    `SELECT * FROM scenarios ORDER BY updated_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    scenario: fromRow(r),
    updatedAt: r.updated_at,
  }));
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM scenarios WHERE id = ?`, [id]);
}

export async function getScenarios(
  page: number,
  limit: number,
): Promise<PaginatedResponse<ScenarioHead>> {
  const db = await getDb();
  const rows = await db.select<
    Pick<ScenarioRow, "id" | "name" | "initial_description" | "updated_at">[]
  >(
    `SELECT id, name, initial_description, updated_at
     FROM scenarios
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [limit, (page - 1) * limit],
  );
  const countRows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM scenarios`,
  );
  const total = countRows?.[0]?.count ?? 0;
  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      initialDescription: r.initial_description,
      updatedAt: r.updated_at,
    })),
    total,
    page,
    limit,
  };
}
