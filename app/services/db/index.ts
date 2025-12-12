import Database from "@tauri-apps/plugin-sql";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let databasePromise: Promise<Database> | null = null;

const DB_NAME = import.meta.env.DEV ? "hakawati-dev.db" : "hakawati.db";

export async function getDb(): Promise<Database> {
  if (!databasePromise) {
    const dbDirectory = await appLocalDataDir();
    const dbPath = await join(dbDirectory, DB_NAME);
    databasePromise = Database.load(`sqlite:${dbPath}`).catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  return databasePromise;
}

export type { Database };
