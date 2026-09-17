import { enqueueLocalOperation } from "@/lib/local-write-queue";
import { getDb } from "@/services/db";
import { withTransaction } from "@/services/db/transaction";
import { toUint8Array } from "@/lib/repository-utils";
import type { ScenarioPublishLink } from "@/types/catalog.type";

type ScenarioPublishLinkRow = {
  local_scenario_id: string;
  catalog_scenario_id: string;
  catalog_scenario_version_id: string | null;
  last_published_at: number;
  draft_cover_initialized: number;
};

function fromRow(row: ScenarioPublishLinkRow): ScenarioPublishLink {
  return {
    localScenarioId: row.local_scenario_id,
    catalogScenarioId: row.catalog_scenario_id,
    catalogScenarioVersionId: row.catalog_scenario_version_id,
    lastPublishedAt: row.last_published_at,
    draftCoverInitialized: Boolean(row.draft_cover_initialized),
  };
}

export async function getScenarioPublishLink(
  localScenarioId: string,
): Promise<ScenarioPublishLink | null> {
  const db = await getDb();
  const rows = await db.select<ScenarioPublishLinkRow[]>(
    `SELECT * FROM scenario_publish_links WHERE local_scenario_id = ? LIMIT 1`,
    [localScenarioId],
  );
  return rows?.[0] ? fromRow(rows[0]) : null;
}

export async function listScenarioPublishLinks(): Promise<
  ScenarioPublishLink[]
> {
  const db = await getDb();
  const rows = await db.select<ScenarioPublishLinkRow[]>(
    `SELECT * FROM scenario_publish_links`,
  );
  return rows.map(fromRow);
}

export async function upsertScenarioPublishLink(
  link: Omit<ScenarioPublishLink, "lastPublishedAt"> & {
    lastPublishedAt?: number;
  },
): Promise<void> {
  await enqueueLocalOperation(async () => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO scenario_publish_links (
         local_scenario_id,
         catalog_scenario_id,
         catalog_scenario_version_id,
         last_published_at,
         draft_cover_initialized
       )
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(local_scenario_id) DO UPDATE SET
         catalog_scenario_id = excluded.catalog_scenario_id,
         catalog_scenario_version_id = excluded.catalog_scenario_version_id,
         last_published_at = excluded.last_published_at,
         draft_cover_initialized = excluded.draft_cover_initialized`,
      [
        link.localScenarioId,
        link.catalogScenarioId,
        link.catalogScenarioVersionId ?? null,
        link.lastPublishedAt ?? Date.now(),
        Number(link.draftCoverInitialized ?? true),
      ],
    );
  });
}

export async function getScenarioDraftCoverState(localScenarioId: string) {
  const db = await getDb();
  const [row] = await db.select<
    Array<{ thumbnail_data: number[] | null; updated_at: number }>
  >(`SELECT thumbnail_data, updated_at FROM scenarios WHERE id = ?`, [
    localScenarioId,
  ]);
  if (!row) throw new Error("The local scenario no longer exists.");
  return {
    thumbnail: toUint8Array(row.thumbnail_data),
    updatedAt: row.updated_at,
  };
}

export async function markScenarioDraftCoverInitialized(
  localScenarioId: string,
): Promise<void> {
  await enqueueLocalOperation(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE scenario_publish_links SET draft_cover_initialized = 1 WHERE local_scenario_id = ?`,
      [localScenarioId],
    );
  });
}

// Adopt a legacy public-only cover once. The version check prevents a slow
// download from undoing edits made in another editor while it was in flight.
export async function initializeScenarioDraftCover(input: {
  localScenarioId: string;
  catalogScenarioId: string;
  expectedUpdatedAt: number;
  thumbnail: Uint8Array | null;
}): Promise<Uint8Array | null> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withTransaction(db, async (transaction) => {
      const [row] = await transaction.select<
        Array<{
          thumbnail_data: number[] | null;
          updated_at: number;
          draft_cover_initialized: number;
        }>
      >(
        `SELECT s.thumbnail_data, s.updated_at, l.draft_cover_initialized
         FROM scenarios s JOIN scenario_publish_links l ON l.local_scenario_id = s.id
         WHERE s.id = ? AND l.catalog_scenario_id = ?`,
        [input.localScenarioId, input.catalogScenarioId],
      );
      if (!row)
        throw new Error(
          "The scenario's publication link changed. Please reopen it.",
        );
      const existing = toUint8Array(row.thumbnail_data);
      if (row.draft_cover_initialized) return existing;
      if (row.updated_at !== input.expectedUpdatedAt) {
        throw new Error(
          "The scenario changed while restoring its cover. Please reopen it.",
        );
      }
      const thumbnail = existing ?? input.thumbnail;
      if (!existing && thumbnail) {
        await transaction.execute(
          `UPDATE scenarios SET thumbnail_data = ?, updated_at = ? WHERE id = ?`,
          [thumbnail, Date.now(), input.localScenarioId],
        );
      }
      await transaction.execute(
        `UPDATE scenario_publish_links SET draft_cover_initialized = 1 WHERE local_scenario_id = ?`,
        [input.localScenarioId],
      );
      return thumbnail;
    });
  });
}
