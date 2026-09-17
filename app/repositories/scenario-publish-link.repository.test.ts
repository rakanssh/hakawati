import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getScenarioDraftCoverState,
  getScenarioPublishLink,
  initializeScenarioDraftCover,
  markScenarioDraftCoverInitialized,
  upsertScenarioPublishLink,
} from "./scenario-publish-link.repository";

type SqlParam = string | number | Uint8Array | null;
const state = vi.hoisted(() => ({ raw: null as DatabaseSync | null }));
const adapter = {
  path: "sqlite:test",
  execute: async (sql: string, params: SqlParam[] = []) => ({
    rowsAffected: Number(state.raw!.prepare(sql).run(...params).changes),
  }),
  select: async <T>(sql: string, params: SqlParam[] = []) =>
    state
      .raw!.prepare(sql)
      .all(...params)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            ArrayBuffer.isView(value) ? Array.from(value as Uint8Array) : value,
          ]),
        ),
      ) as T,
};
vi.mock("@/services/db", () => ({ getDb: async () => adapter }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (
    command: string,
    args: {
      sql?: string;
      values?: SqlParam[];
      select?: boolean;
      commit?: boolean;
    },
  ) => {
    if (command === "begin_database_transaction") {
      state.raw!.exec("BEGIN");
      return 1;
    }
    if (command === "query_database_transaction")
      return args.select
        ? adapter.select(args.sql!, args.values)
        : adapter.execute(args.sql!, args.values);
    if (command === "end_database_transaction") {
      state.raw!.exec(args.commit ? "COMMIT" : "ROLLBACK");
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  },
}));

beforeEach(() => {
  state.raw = new DatabaseSync(":memory:");
  state.raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE scenarios (id TEXT PRIMARY KEY, name TEXT, initial_description TEXT, thumbnail_data BLOB, updated_at INTEGER);
    CREATE TABLE scenario_publish_links (
      local_scenario_id TEXT PRIMARY KEY, catalog_scenario_id TEXT NOT NULL,
      catalog_scenario_version_id TEXT, last_published_at INTEGER NOT NULL,
      FOREIGN KEY (local_scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );
    INSERT INTO scenarios VALUES ('local-1', 'Current name', 'Current description', NULL, 123);
    INSERT INTO scenario_publish_links VALUES ('local-1', 'catalog-1', 'version-1', 1);
  `);
  state.raw.exec(
    readFileSync(
      join(
        process.cwd(),
        "src-tauri/migrations/007_unify_scenario_draft_cover.sql",
      ),
      "utf8",
    ),
  );
});
afterEach(() => {
  state.raw?.close();
  state.raw = null;
});

const input = () => ({
  localScenarioId: "local-1",
  catalogScenarioId: "catalog-1",
  expectedUpdatedAt: 123,
  thumbnail: new Uint8Array([1, 2, 3]),
});

describe("scenario draft cover initialization", () => {
  it("marks existing links for one-time recovery and new publications as initialized", async () => {
    expect(await getScenarioPublishLink("local-1")).toMatchObject({
      draftCoverInitialized: false,
    });
    await upsertScenarioPublishLink({
      localScenarioId: "local-1",
      catalogScenarioId: "catalog-1",
      catalogScenarioVersionId: "version-2",
    });
    expect(await getScenarioPublishLink("local-1")).toMatchObject({
      draftCoverInitialized: true,
      catalogScenarioVersionId: "version-2",
    });
  });

  it("persists the public cover and marker together without replacing local text", async () => {
    await initializeScenarioDraftCover(input());
    expect((await getScenarioDraftCoverState("local-1")).thumbnail).toEqual(
      input().thumbnail,
    );
    expect(
      state
        .raw!.prepare("SELECT name, initial_description FROM scenarios")
        .get(),
    ).toEqual({
      name: "Current name",
      initial_description: "Current description",
    });
    expect(await getScenarioPublishLink("local-1")).toMatchObject({
      draftCoverInitialized: true,
    });
  });

  it("keeps the existing local cover", async () => {
    state
      .raw!.prepare("UPDATE scenarios SET thumbnail_data = ?")
      .run(new Uint8Array([9]));
    await expect(initializeScenarioDraftCover(input())).resolves.toEqual(
      new Uint8Array([9]),
    );
  });

  it("does not undo a later deliberate removal", async () => {
    await markScenarioDraftCoverInitialized("local-1");
    await expect(initializeScenarioDraftCover(input())).resolves.toBeNull();
    expect((await getScenarioDraftCoverState("local-1")).thumbnail).toBeNull();
  });

  it("rejects an in-flight recovery when the local draft changed", async () => {
    state.raw!.exec(
      "UPDATE scenarios SET updated_at = 124, name = 'Newer name'",
    );
    await expect(initializeScenarioDraftCover(input())).rejects.toThrow(
      "scenario changed",
    );
    expect((await getScenarioDraftCoverState("local-1")).thumbnail).toBeNull();
    expect(await getScenarioPublishLink("local-1")).toMatchObject({
      draftCoverInitialized: false,
    });
  });

  it("rolls back the restored cover if writing the marker fails", async () => {
    state.raw!.exec(
      "CREATE TRIGGER reject_marker BEFORE UPDATE ON scenario_publish_links BEGIN SELECT RAISE(ABORT, 'failed marker'); END;",
    );
    await expect(initializeScenarioDraftCover(input())).rejects.toThrow(
      "failed marker",
    );
    expect((await getScenarioDraftCoverState("local-1")).thumbnail).toBeNull();
  });
});
