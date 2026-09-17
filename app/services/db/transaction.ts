import { invoke } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import type { QueryResult } from "@tauri-apps/plugin-sql";

/** Run every read/write on one native connection and commit only on success. */
export async function withTransaction<T>(
  db: Database,
  run: (transaction: Database) => Promise<T>,
): Promise<T> {
  const id = await invoke<number>("begin_database_transaction", {
    db: db.path,
  });
  const transaction: Database = {
    path: db.path,
    execute: (sql, values = []) =>
      invoke<QueryResult>("query_database_transaction", {
        id,
        sql,
        values,
        select: false,
      }),
    select: <R>(sql: string, values: unknown[] = []) =>
      invoke<R>("query_database_transaction", {
        id,
        sql,
        values,
        select: true,
      }),
    close: () =>
      Promise.reject(
        new Error("Cannot close a database from inside a transaction"),
      ),
  };
  try {
    const result = await run(transaction);
    await invoke("end_database_transaction", { id, commit: true });
    return result;
  } catch (error) {
    await invoke("end_database_transaction", { id, commit: false }).catch(
      () => undefined,
    );
    throw error;
  }
}
