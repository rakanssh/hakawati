import type { Database as SqlDatabase, SqlValue } from "sql.js";
import type { QueryResult } from "@tauri-apps/plugin-sql";

/** One in-memory SQLite connection, with exclusive access during transactions. */
export class PreviewDatabase {
  readonly path = "sqlite:browser-preview";
  private queue = Promise.resolve();
  private active: { id: number; release: () => void } | null = null;
  private nextId = 0;

  constructor(private readonly raw: SqlDatabase) {}

  private async lock() {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  private query(sql: string, values: unknown[], select: boolean) {
    const params = values.map((value): SqlValue => {
      if (value == null) return null;
      if (typeof value === "boolean") return Number(value);
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        value instanceof Uint8Array
      )
        return value;
      if (Array.isArray(value)) return new Uint8Array(value);
      throw new Error("Unsupported preview SQL parameter");
    });
    const statement = this.raw.prepare(sql);
    try {
      statement.bind(params);
      const rows = [];
      while (statement.step()) {
        if (select) rows.push(statement.getAsObject());
      }
      if (select) return rows;
      return {
        rowsAffected: this.raw.getRowsModified(),
        lastInsertId: Number(
          this.raw.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0,
        ),
      };
    } finally {
      statement.free();
    }
  }

  async execute(sql: string, values: unknown[] = []): Promise<QueryResult> {
    const release = await this.lock();
    try {
      return this.query(sql, values, false) as QueryResult;
    } finally {
      release();
    }
  }

  async select<T>(sql: string, values: unknown[] = []): Promise<T> {
    const release = await this.lock();
    try {
      return this.query(sql, values, true) as T;
    } finally {
      release();
    }
  }

  async beginTransaction() {
    const release = await this.lock();
    try {
      this.raw.run("BEGIN");
      const id = ++this.nextId;
      this.active = { id, release };
      return id;
    } catch (error) {
      release();
      throw error;
    }
  }

  queryTransaction(
    id: number,
    sql: string,
    values: unknown[],
    select: boolean,
  ) {
    if (this.active?.id !== id)
      throw new Error("Preview transaction is not active");
    return this.query(sql, values, select);
  }

  endTransaction(id: number, commit: boolean) {
    if (this.active?.id !== id)
      throw new Error("Preview transaction is not active");
    const { release } = this.active;
    try {
      this.raw.run(commit ? "COMMIT" : "ROLLBACK");
    } catch (error) {
      if (commit) this.raw.run("ROLLBACK");
      throw error;
    } finally {
      this.active = null;
      release();
    }
  }

  async close() {
    const release = await this.lock();
    try {
      this.raw.close();
      return true;
    } finally {
      release();
    }
  }
}
