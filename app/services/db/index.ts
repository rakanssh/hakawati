import Database from "@tauri-apps/plugin-sql";

let databasePromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load("sqlite:hakawati.db");
  }
  return databasePromise;
}

export type { Database };
