use serde_json::{Map, Value};
use sqlx::{sqlite::SqliteRow, Column, Row, Sqlite, SqlitePool, Transaction, TypeInfo, ValueRef};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
use tauri::async_runtime::Mutex;

const IDLE_TIMEOUT: Duration = Duration::from_secs(120);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

struct ActiveTransaction {
    id: u64,
    last_query: Instant,
    transaction: Transaction<'static, Sqlite>,
}

#[derive(Default)]
pub struct DatabaseTransactions(Mutex<Option<ActiveTransaction>>);

impl DatabaseTransactions {
    async fn begin(&self, pool: &SqlitePool) -> Result<u64, String> {
        let mut active = self.0.lock().await;
        if let Some(previous) = active.as_ref() {
            if previous.last_query.elapsed() < IDLE_TIMEOUT {
                return Err("A local database transaction is already active".into());
            }
            // A reloaded renderer may have abandoned its transaction. Never
            // commit that partial work when accepting a later operation.
            active
                .take()
                .unwrap()
                .transaction
                .rollback()
                .await
                .map_err(|e| e.to_string())?;
        }
        let transaction = pool.begin().await.map_err(|e| e.to_string())?;
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        *active = Some(ActiveTransaction {
            id,
            transaction,
            last_query: Instant::now(),
        });
        Ok(id)
    }

    async fn query(
        &self,
        id: u64,
        sql: &str,
        values: Vec<Value>,
        select: bool,
    ) -> Result<Value, String> {
        let mut active = self.0.lock().await;
        let current = active
            .as_mut()
            .filter(|current| current.id == id)
            .ok_or("Local database transaction is no longer active")?;
        current.last_query = Instant::now();
        let result = query(&mut current.transaction, sql, values, select).await;
        if result.is_err() {
            // Roll back immediately on SQL failure, even if the renderer never
            // gets to its finally/catch handler.
            let failed = active.take().unwrap();
            let _ = failed.transaction.rollback().await;
        }
        result
    }

    async fn end(&self, id: u64, commit: bool) -> Result<(), String> {
        let mut active = self.0.lock().await;
        if active.as_ref().is_none_or(|current| current.id != id) {
            return if commit {
                Err("Local database transaction is no longer active".into())
            } else {
                Ok(())
            };
        }
        let current = active.take().unwrap();
        if commit {
            current.transaction.commit().await
        } else {
            current.transaction.rollback().await
        }
        .map_err(|e| e.to_string())
    }
}

async fn query(
    transaction: &mut Transaction<'_, Sqlite>,
    sql: &str,
    values: Vec<Value>,
    select: bool,
) -> Result<Value, String> {
    let mut statement = sqlx::query(sql);
    for value in values {
        statement = match value {
            Value::Null => statement.bind(None::<String>),
            Value::String(value) => statement.bind(value),
            Value::Number(value) => {
                if let Some(value) = value.as_i64() {
                    statement.bind(value)
                } else {
                    statement.bind(value.as_f64().ok_or("Invalid SQL number")?)
                }
            }
            // Match tauri-plugin-sql's JSON binding for boolean/array/object
            // values, including its existing thumbnail representation.
            value => statement.bind(value),
        };
    }
    if select {
        let rows = statement
            .fetch_all(&mut **transaction)
            .await
            .map_err(|e| e.to_string())?;
        rows.into_iter()
            .map(row_to_json)
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array)
    } else {
        let result = statement
            .execute(&mut **transaction)
            .await
            .map_err(|e| e.to_string())?;
        Ok(
            serde_json::json!({ "rowsAffected": result.rows_affected(), "lastInsertId": result.last_insert_rowid() }),
        )
    }
}

fn row_to_json(row: SqliteRow) -> Result<Value, String> {
    let mut result = Map::new();
    for (index, column) in row.columns().iter().enumerate() {
        let raw = row.try_get_raw(index).map_err(|e| e.to_string())?;
        let value = if raw.is_null() {
            Value::Null
        } else {
            match raw.type_info().name() {
                "INTEGER" | "NUMERIC" => {
                    Value::from(row.try_get::<i64, _>(index).map_err(|e| e.to_string())?)
                }
                "REAL" => Value::from(row.try_get::<f64, _>(index).map_err(|e| e.to_string())?),
                "BOOLEAN" => Value::from(row.try_get::<bool, _>(index).map_err(|e| e.to_string())?),
                "TEXT" => Value::from(row.try_get::<String, _>(index).map_err(|e| e.to_string())?),
                "BLOB" => Value::from(
                    row.try_get::<Vec<u8>, _>(index)
                        .map_err(|e| e.to_string())?,
                ),
                kind => return Err(format!("Unsupported SQLite value type: {kind}")),
            }
        };
        result.insert(column.name().to_string(), value);
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub async fn begin_database_transaction(
    db: String,
    databases: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    transactions: tauri::State<'_, DatabaseTransactions>,
) -> Result<u64, String> {
    let pool = {
        let databases = databases.0.read().await;
        let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = databases.get(&db) else {
            return Err("Local SQLite database has not been loaded".into());
        };
        pool.clone()
    };
    transactions.begin(&pool).await
}

#[tauri::command]
pub async fn query_database_transaction(
    id: u64,
    sql: String,
    values: Vec<Value>,
    select: bool,
    transactions: tauri::State<'_, DatabaseTransactions>,
) -> Result<Value, String> {
    transactions.query(id, &sql, values, select).await
}

#[tauri::command]
pub async fn end_database_transaction(
    id: u64,
    commit: bool,
    transactions: tauri::State<'_, DatabaseTransactions>,
) -> Result<(), String> {
    transactions.end(id, commit).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abandoned_transactions_roll_back_and_old_ids_cannot_change_the_next_save() {
        crate::run_async_command(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            sqlx::query("CREATE TABLE turns(value TEXT)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO turns VALUES ('original')")
                .execute(&pool)
                .await
                .unwrap();
            let transactions = DatabaseTransactions::default();
            let abandoned = transactions.begin(&pool).await.unwrap();
            transactions
                .query(abandoned, "DELETE FROM turns", vec![], false)
                .await
                .unwrap();
            assert!(transactions.begin(&pool).await.is_err());
            transactions.0.lock().await.as_mut().unwrap().last_query =
                Instant::now() - IDLE_TIMEOUT - Duration::from_secs(1);

            let current = transactions.begin(&pool).await.unwrap();
            assert_ne!(current, abandoned);
            assert!(transactions
                .query(abandoned, "DELETE FROM turns", vec![], false)
                .await
                .is_err());
            assert!(transactions.end(abandoned, true).await.is_err());
            transactions.end(abandoned, false).await.unwrap();
            assert_eq!(
                transactions
                    .query(current, "SELECT value FROM turns", vec![], true)
                    .await
                    .unwrap(),
                serde_json::json!([{ "value": "original" }])
            );
            transactions
                .query(
                    current,
                    "UPDATE turns SET value = 'new save'",
                    vec![],
                    false,
                )
                .await
                .unwrap();
            transactions.end(current, true).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, String>("SELECT value FROM turns")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                "new save"
            );
            pool.close().await;
        });
    }

    #[test]
    fn a_failed_replacement_rolls_back_deleted_history_and_allows_the_next_save() {
        crate::run_async_command(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            sqlx::query("CREATE TABLE turns(id TEXT PRIMARY KEY, text TEXT NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO turns VALUES ('old', 'Preserve me')")
                .execute(&pool)
                .await
                .unwrap();
            let transactions = DatabaseTransactions::default();
            let id = transactions.begin(&pool).await.unwrap();
            transactions
                .query(id, "DELETE FROM turns", vec![], false)
                .await
                .unwrap();
            assert!(transactions
                .query(
                    id,
                    "INSERT INTO turns VALUES (?, ?)",
                    vec![Value::from("new"), Value::Null],
                    false
                )
                .await
                .is_err());
            let rows: Vec<(String, String)> = sqlx::query_as("SELECT * FROM turns")
                .fetch_all(&pool)
                .await
                .unwrap();
            assert_eq!(rows, vec![("old".into(), "Preserve me".into())]);
            assert!(transactions.end(id, true).await.is_err());
            let next = transactions.begin(&pool).await.unwrap();
            transactions
                .query(
                    next,
                    "UPDATE turns SET text = ?",
                    vec![Value::from("Saved")],
                    false,
                )
                .await
                .unwrap();
            transactions.end(next, true).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, String>("SELECT text FROM turns")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                "Saved"
            );
            pool.close().await;
        });
    }

    #[test]
    fn transaction_reads_see_own_writes_and_preserve_sqlite_values() {
        crate::run_async_command(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            let transactions = DatabaseTransactions::default();
            let id = transactions.begin(&pool).await.unwrap();
            transactions
                .query(id, "CREATE TABLE values_test(value INTEGER)", vec![], false)
                .await
                .unwrap();
            transactions
                .query(
                    id,
                    "INSERT INTO values_test VALUES (?)",
                    vec![Value::from(9007199254740991_i64)],
                    false,
                )
                .await
                .unwrap();
            let rows = transactions.query(id, "SELECT value, 1.5 AS real_value, NULL AS empty, 'text' AS text_value, X'00FF' AS bytes FROM values_test", vec![], true).await.unwrap();
            assert_eq!(
                rows[0],
                serde_json::json!({"value": 9007199254740991_i64, "real_value": 1.5, "empty": null, "text_value": "text", "bytes": [0,255]})
            );
            transactions.end(id, false).await.unwrap();
            assert!(sqlx::query("SELECT * FROM values_test")
                .fetch_all(&pool)
                .await
                .is_err());
            pool.close().await;
        });
    }
}
