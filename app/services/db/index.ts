import Database from "@tauri-apps/plugin-sql";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let databasePromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!databasePromise) {
    const dbDirectory = await appLocalDataDir();
    const dbPath = await join(dbDirectory, "hakawati.db");
    databasePromise = Database.load(`sqlite:${dbPath}`).catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  return databasePromise;
}

export type { Database };
