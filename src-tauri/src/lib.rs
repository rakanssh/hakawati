mod oauth_loopback;
mod secret_store;
mod speech_recorder;

use std::{future::Future, path::Path};

struct LegacyMigrationChecksum {
    version: i64,
    description: &'static str,
    legacy_checksum_hex: &'static str,
    current_checksum_hex: &'static str,
}

const LEGACY_MIGRATION_CHECKSUMS: &[LegacyMigrationChecksum] = &[
    LegacyMigrationChecksum {
        version: 1,
        description: "create_scenarios_table",
        legacy_checksum_hex: "2b5adfe6973b2bb577b3971031b2b62271bc31ca11310588dfe1ef3952a5b5cfbf9d674bfc23deded807930a70b61309",
        current_checksum_hex: "20273b4a6a919ff11c336ae859f0567c5cff09afb60c28d483da0e2659ef78d013d97b995c110a307360756eea6c58fe",
    },
    LegacyMigrationChecksum {
        version: 2,
        description: "create_tales_table",
        legacy_checksum_hex: "012387dc0bcdf98564a93e01c014fa529aa16319ce05e699dc64ac764033e924dbb8e2b5b3824e3a6de22271d2fb4b70",
        current_checksum_hex: "1c6525221f4ca8d828b1a93071c37f96aee170b19896cfc6a4bddf7f259773ba266c43441eee4871e8d8983fec58fb3e",
    },
    LegacyMigrationChecksum {
        version: 3,
        description: "add_prompt_components",
        legacy_checksum_hex: "82a39d84ffac1b10e4bf9ec1f70fca797ac6f3f2b90f4e4f56cf8871005ff85097753dee5c22919d390482385b93b33b",
        current_checksum_hex: "49702c8ec2434f5db4472262ebeacea1eb101809746e086dc70c66233206026897febbc59409f867537622e7261216cf",
    },
];

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn sqlite_url(db_path: &Path) -> String {
    format!("sqlite:{}", db_path.to_string_lossy())
}

fn run_async_command<F>(command: F) -> F::Output
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        sender
            .send(tauri::async_runtime::block_on(command))
            .unwrap();
    });
    receiver.recv().unwrap()
}

async fn repair_legacy_migration_checksums(db_path: &Path) -> Result<(), sqlx::Error> {
    if !db_path.exists() {
        return Ok(());
    }

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(db_path))
        .await?;
    let has_migrations_table: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await?;

    if has_migrations_table.is_none() {
        pool.close().await;
        return Ok(());
    }

    for checksum in LEGACY_MIGRATION_CHECKSUMS {
        sqlx::query(
            "UPDATE _sqlx_migrations
             SET checksum = ?
             WHERE version = ?
               AND description = ?
               AND success = 1
               AND checksum = ?",
        )
        .bind(hex_to_bytes(checksum.current_checksum_hex))
        .bind(checksum.version)
        .bind(checksum.description)
        .bind(hex_to_bytes(checksum.legacy_checksum_hex))
        .execute(&pool)
        .await?;
    }

    pool.close().await;
    Ok(())
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    hex.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16).unwrap();
            let low = (pair[1] as char).to_digit(16).unwrap();
            ((high << 4) | low) as u8
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn repairs_only_known_legacy_migration_checksums() {
        run_async_command(async {
            let db_path = std::env::temp_dir().join(format!(
                "hakawati-migration-checksums-{}-{}.db",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let db_url = sqlite_url(&db_path);
            std::fs::File::create(&db_path).unwrap();
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .unwrap();

            sqlx::query(
                "CREATE TABLE _sqlx_migrations (
                    version BIGINT PRIMARY KEY,
                    description TEXT NOT NULL,
                    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN NOT NULL,
                    checksum BLOB NOT NULL,
                    execution_time BIGINT NOT NULL
                )",
            )
            .execute(&pool)
            .await
            .unwrap();

            for checksum in LEGACY_MIGRATION_CHECKSUMS {
                sqlx::query(
                    "INSERT INTO _sqlx_migrations (
                        version,
                        description,
                        success,
                        checksum,
                        execution_time
                    )
                    VALUES (?, ?, 1, ?, 0)",
                )
                .bind(checksum.version)
                .bind(checksum.description)
                .bind(hex_to_bytes(checksum.legacy_checksum_hex))
                .execute(&pool)
                .await
                .unwrap();
            }

            sqlx::query(
                "INSERT INTO _sqlx_migrations (
                    version,
                    description,
                    success,
                    checksum,
                    execution_time
                )
                VALUES (99, 'other_migration', 1, ?, 0)",
            )
            .bind(vec![0xde, 0xad, 0xbe, 0xef])
            .execute(&pool)
            .await
            .unwrap();

            pool.close().await;

            repair_legacy_migration_checksums(&db_path).await.unwrap();

            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .unwrap();
            let rows = sqlx::query_as::<_, (i64, String)>(
                "SELECT version, lower(hex(checksum))
                 FROM _sqlx_migrations
                 ORDER BY version",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            pool.close().await;
            std::fs::remove_file(db_path).unwrap();

            let mut expected: Vec<_> = LEGACY_MIGRATION_CHECKSUMS
                .iter()
                .map(|checksum| (checksum.version, checksum.current_checksum_hex.to_string()))
                .collect();
            expected.push((99, "deadbeef".to_string()));
            assert_eq!(rows, expected);
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    use tauri_plugin_sql::{Migration, MigrationKind};

    let builder = tauri::Builder::default();

    let builder = builder.setup(|app| {
        let app_data_dir = app.path().app_local_data_dir()?;

        std::fs::create_dir_all(&app_data_dir)?;

        let db_name = if cfg!(debug_assertions) {
            "hakawati-dev.db"
        } else {
            "hakawati.db"
        };
        let db_path = app_data_dir.join(db_name);
        let db_url = sqlite_url(&db_path);

        let repair_db_path = db_path.clone();
        if let Err(error) = run_async_command(async move {
            repair_legacy_migration_checksums(&repair_db_path).await
        }) {
            eprintln!("Unable to repair legacy migration checksums: {error}");
        }

        let migrations = vec![
            Migration {
                version: 1,
                description: "create_scenarios_table",
                sql: include_str!("../migrations/001_create_scenarios.sql"),
                kind: MigrationKind::Up,
            },
            Migration {
                version: 2,
                description: "create_tales_table",
                sql: include_str!("../migrations/002_create_tales.sql"),
                kind: MigrationKind::Up,
            },
            Migration {
                version: 3,
                description: "add_prompt_components",
                sql: include_str!("../migrations/003_add_prompt_components.sql"),
                kind: MigrationKind::Up,
            },
            Migration {
                version: 4,
                description: "split_tale_storage",
                sql: include_str!("../migrations/004_split_tale_storage.sql"),
                kind: MigrationKind::Up,
            },
            Migration {
                version: 5,
                description: "add_sync_metadata",
                sql: include_str!("../migrations/005_add_sync_metadata.sql"),
                kind: MigrationKind::Up,
            },
            Migration {
                version: 6,
                description: "add_scenario_content_catalog_metadata",
                sql: include_str!("../migrations/006_add_scenario_content_catalog_metadata.sql"),
                kind: MigrationKind::Up,
            },
        ];

        app.handle().plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&db_url, migrations)
                .build(),
        )?;

        Ok(())
    });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder;

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(oauth_loopback::OAuthLoopbackState::default())
        .manage(speech_recorder::SpeechRecorderState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            oauth_loopback::start_oauth_loopback,
            oauth_loopback::wait_oauth_loopback,
            secret_store::set_hosted_refresh_token,
            secret_store::get_hosted_refresh_token,
            secret_store::delete_hosted_refresh_token,
            speech_recorder::start_speech_recording,
            speech_recorder::stop_speech_recording,
            speech_recorder::get_speech_recording_level,
            speech_recorder::cancel_speech_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
