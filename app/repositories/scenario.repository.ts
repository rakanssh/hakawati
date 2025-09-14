import { getDb } from "@/services/db";
import { Scenario, ScenarioHead, GameMode } from "@/types/context.type";
import { ScenarioRow, PaginatedResponse } from "@/types/db.type";
import { v4 as uuidv4 } from "uuid"; // TODO: replace with nanoid

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

function toRow(id: string, s: Scenario, ts: number): ScenarioRow {
  return {
    id,
    name: s.name,
    initial_game_mode: s.initialGameMode,
    initial_description: s.initialDescription,
    initial_author_note: s.initialAuthorNote,
    initial_stats: JSON.stringify(s.initialStats),
    initial_inventory: JSON.stringify(s.initialInventory),
    initial_story_cards: JSON.stringify(s.initialStoryCards),
    thumbnail_data: s.thumbnail ?? null,
    opening_text: s.openingText ?? "",
    created_at: ts,
    updated_at: ts,
  };
}

function fromRow(r: ScenarioRow): Scenario {
  return {
    id: r.id,
    name: r.name,
    initialGameMode:
      r.initial_game_mode === GameMode.GM ? GameMode.GM : GameMode.STORY_TELLER,
    initialDescription: r.initial_description,
    initialAuthorNote: r.initial_author_note,
    initialStats: JSON.parse(r.initial_stats),
    initialInventory: JSON.parse(r.initial_inventory),
    initialStoryCards: JSON.parse(r.initial_story_cards),
    thumbnail: toUint8Array(r.thumbnail_data ?? null),
    openingText: r.opening_text ?? "",
  };
}

export async function upsertScenario(
  input: Scenario,
  id?: string,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const scenarioId = id ?? uuidv4();
  const row = toRow(scenarioId, input, now);
  await db.execute(
    `INSERT INTO scenarios (id, name, initial_game_mode, initial_description, initial_author_note, initial_stats, initial_inventory, initial_story_cards, thumbnail_data, opening_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       initial_game_mode=excluded.initial_game_mode,
       initial_description=excluded.initial_description,
       initial_author_note=excluded.initial_author_note,
       initial_stats=excluded.initial_stats,
       initial_inventory=excluded.initial_inventory,
       initial_story_cards=excluded.initial_story_cards,
       thumbnail_data=excluded.thumbnail_data,
       opening_text=excluded.opening_text,
       updated_at=excluded.updated_at`,
    [
      row.id,
      row.name,
      row.initial_game_mode,
      row.initial_description,
      row.initial_author_note,
      row.initial_stats,
      row.initial_inventory,
      row.initial_story_cards,
      row.thumbnail_data ?? null,
      row.opening_text ?? "",
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
    Pick<
      ScenarioRow,
      | "id"
      | "name"
      | "initial_game_mode"
      | "initial_description"
      | "updated_at"
      | "thumbnail_data"
    >[]
  >(
    `SELECT id, name, initial_game_mode, initial_description, updated_at, thumbnail_data
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
      initialGameMode:
        r.initial_game_mode === GameMode.GM
          ? GameMode.GM
          : GameMode.STORY_TELLER,
      initialDescription: r.initial_description,
      updatedAt: r.updated_at,
      thumbnail: toUint8Array(r.thumbnail_data ?? null),
    })),
    total,
    page,
    limit,
  };
}

export async function getScenarioHead(
  id: string,
): Promise<ScenarioHead | null> {
  const db = await getDb();
  const rows = await db.select<
    Pick<
      ScenarioRow,
      | "id"
      | "name"
      | "initial_game_mode"
      | "initial_description"
      | "updated_at"
      | "thumbnail_data"
    >[]
  >(
    `SELECT id, name, initial_game_mode, initial_description, updated_at, thumbnail_data FROM scenarios WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows || rows.length === 0) return null;
  return {
    id: rows[0].id,
    name: rows[0].name,
    initialGameMode:
      rows[0].initial_game_mode === GameMode.GM
        ? GameMode.GM
        : GameMode.STORY_TELLER,
    initialDescription: rows[0].initial_description,
    updatedAt: rows[0].updated_at,
    thumbnail: toUint8Array(rows[0].thumbnail_data ?? null),
  };
}
