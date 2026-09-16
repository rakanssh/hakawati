import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { PreviewDatabase } from "./database";

const migrations = import.meta.glob<string>(
  "../../src-tauri/migrations/*.sql",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);
let database: Promise<PreviewDatabase> | undefined;

export default class Database {
  static load(_path?: string): Promise<PreviewDatabase> {
    database ??= (async () => {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const raw = new SQL.Database();
      try {
        raw.run("PRAGMA foreign_keys = ON");
        for (const [, sql] of Object.entries(migrations).sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          raw.run(sql);
        }
        return new PreviewDatabase(raw);
      } catch (error) {
        raw.close();
        throw error;
      }
    })().catch((error) => {
      database = undefined;
      throw error;
    });
    return database;
  }
}
