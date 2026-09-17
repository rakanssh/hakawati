// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreviewDatabase } from "./database";

let db: PreviewDatabase;
beforeEach(async () => {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON");
  const directory = resolve("src-tauri/migrations");
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    raw.run(readFileSync(resolve(directory, name), "utf8"));
  }
  db = new PreviewDatabase(raw);
});
afterEach(async () => {
  await db?.close();
});

describe("browser preview SQLite", () => {
  it("applies the real migrations and enforces foreign keys", async () => {
    expect(await db.select("SELECT content FROM scenarios")).toEqual([]);
    expect(await db.select("SELECT state_json FROM tale_states")).toEqual([]);
    expect(await db.select("PRAGMA foreign_keys")).toEqual([
      { foreign_keys: 1 },
    ]);
    await expect(
      db.execute("INSERT INTO tale_sessions (tale_id) VALUES (?)", ["missing"]),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("rolls back failed writes and keeps unrelated reads outside the transaction", async () => {
    await db.execute(
      "CREATE TABLE preview_check (id INTEGER PRIMARY KEY, value BLOB)",
    );
    const id = await db.beginTransaction();
    db.queryTransaction(
      id,
      "INSERT INTO preview_check (value) VALUES (?)",
      [new Uint8Array([1, 2, 3])],
      false,
    );
    expect(
      db.queryTransaction(id, "SELECT id FROM preview_check", [], true),
    ).toEqual([{ id: 1 }]);
    let readFinished = false;
    const read = db.select("SELECT * FROM preview_check").then((rows) => {
      readFinished = true;
      return rows;
    });
    await Promise.resolve();
    expect(readFinished).toBe(false);
    db.endTransaction(id, false);
    expect(await read).toEqual([]);
    const committed = await db.beginTransaction();
    db.queryTransaction(
      committed,
      "INSERT INTO preview_check (value) VALUES (?)",
      [new Uint8Array([4, 5])],
      false,
    );
    db.endTransaction(committed, true);
    expect(await db.select("SELECT value FROM preview_check")).toEqual([
      { value: new Uint8Array([4, 5]) },
    ]);
    expect(() => db.queryTransaction(committed, "SELECT 1", [], true)).toThrow(
      /not active/,
    );
  });
});
