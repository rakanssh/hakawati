import Database from "@tauri-apps/plugin-sql";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let databasePromise: Promise<Database> | null = null;

const DB_NAME = import.meta.env.DEV ? "hakawati-dev.db" : "hakawati.db";

export async function getDb(): Promise<Database> {
  if (!databasePromise) {
    const dbDirectory = await appLocalDataDir();
    const dbPath = await join(dbDirectory, DB_NAME);
    databasePromise = Database.load(`sqlite:${dbPath}`)
      .then(async (db) => {
        await db.execute("PRAGMA foreign_keys = ON");
        const rows = await db.select<Array<{ foreign_keys: number | string }>>(
          "PRAGMA foreign_keys",
        );
        if (Number(rows?.[0]?.foreign_keys) !== 1) {
          throw new Error("Failed to enable SQLite foreign key enforcement");
        }
        return db;
      })
      .catch((err) => {
        databasePromise = null;
        throw err;
      });
  }
  return databasePromise;
}

export type { Database };
