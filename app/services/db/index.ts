import Database from "@tauri-apps/plugin-sql";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let databasePromise: Promise<Database> | null = null;

const DB_NAME = import.meta.env.DEV ? "hakawati-dev.db" : "hakawati.db";

export function getDb(): Promise<Database> {
  if (!databasePromise) {
    // Cache the whole initialization, including path resolution, so concurrent
    // readers cannot replace each other's native connection pool during startup.
    databasePromise = (async () => {
      const dbDirectory = await appLocalDataDir();
      const dbPath = await join(dbDirectory, DB_NAME);
      const db = await Database.load(`sqlite:${dbPath}`);
      try {
        await db.execute("PRAGMA foreign_keys = ON");
        const rows = await db.select<Array<{ foreign_keys: number | string }>>(
          "PRAGMA foreign_keys",
        );
        if (Number(rows?.[0]?.foreign_keys) !== 1) {
          throw new Error("Failed to enable SQLite foreign key enforcement");
        }
        return db;
      } catch (error) {
        await db.close().catch(() => undefined);
        throw error;
      }
    })().catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  return databasePromise;
}

export type { Database };
