import { enqueueLocalWrite } from "@/lib/local-write-queue";
import { getDb } from "@/services/db";
import type { ScenarioPublishLink } from "@/types/catalog.type";

type ScenarioPublishLinkRow = {
  local_scenario_id: string;
  catalog_scenario_id: string;
  catalog_scenario_version_id: string | null;
  last_published_at: number;
};

function fromRow(row: ScenarioPublishLinkRow): ScenarioPublishLink {
  return {
    localScenarioId: row.local_scenario_id,
    catalogScenarioId: row.catalog_scenario_id,
    catalogScenarioVersionId: row.catalog_scenario_version_id,
    lastPublishedAt: row.last_published_at,
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
  await enqueueLocalWrite(async () => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO scenario_publish_links (
         local_scenario_id,
         catalog_scenario_id,
         catalog_scenario_version_id,
         last_published_at
       )
       VALUES (?, ?, ?, ?)
       ON CONFLICT(local_scenario_id) DO UPDATE SET
         catalog_scenario_id = excluded.catalog_scenario_id,
         catalog_scenario_version_id = excluded.catalog_scenario_version_id,
         last_published_at = excluded.last_published_at`,
      [
        link.localScenarioId,
        link.catalogScenarioId,
        link.catalogScenarioVersionId ?? null,
        link.lastPublishedAt ?? Date.now(),
      ],
    );
  });
}
