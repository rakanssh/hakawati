mod migration_backup;
mod oauth_loopback;
mod secret_store;
mod speech_recorder;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationRecoveryStatus {
    message: String,
    app_data_dir: String,
}

struct MigrationRecoveryState(Option<MigrationRecoveryStatus>);

#[tauri::command]
fn migration_recovery_status(
    state: tauri::State<'_, MigrationRecoveryState>,
) -> Option<MigrationRecoveryStatus> {
    state.0.clone()
}

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
    use serde_json::Value;
    use sha2::{Digest, Sha256};
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

    #[test]
    fn upgrades_and_restores_the_v0152_release_fixture_without_data_loss() {
        run_async_command(async {
            let root = std::env::temp_dir().join(format!(
                "hakawati-v0152-upgrade-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&root).unwrap();
            let db_path = root.join("hakawati.db");
            let fixture = include_bytes!("../fixtures/v0.15.2-release.db");
            let manifest: Value =
                serde_json::from_str(include_str!("../fixtures/v0.15.2-release.manifest.json"))
                    .unwrap();
            std::fs::write(&db_path, fixture).unwrap();

            assert_eq!(manifest["sourceSchemaVersion"], 3);
            assert_eq!(manifest["byteSize"], fixture.len());
            assert_eq!(manifest["sha256"], format!("{:x}", Sha256::digest(fixture)));
            assert_fixture_source_state(&db_path, &manifest).await;

            let marker = migration_backup::prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();
            repair_legacy_migration_checksums(&db_path).await.unwrap();

            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&sqlite_url(&db_path))
                .await
                .unwrap();
            for (version, description, migration) in [
                (
                    4_i64,
                    "split_tale_storage",
                    include_str!("../migrations/004_split_tale_storage.sql"),
                ),
                (
                    5_i64,
                    "add_sync_metadata",
                    include_str!("../migrations/005_add_sync_metadata.sql"),
                ),
                (
                    6_i64,
                    "add_scenario_catalog_content",
                    include_str!("../migrations/006_add_scenario_content_catalog_metadata.sql"),
                ),
            ] {
                sqlx::raw_sql(migration).execute(&pool).await.unwrap();
                sqlx::query(
                    "INSERT INTO _sqlx_migrations (
                        version, description, success, checksum, execution_time
                     ) VALUES (?, ?, 1, X'00', 0)",
                )
                .bind(version)
                .bind(description)
                .execute(&pool)
                .await
                .unwrap();
            }

            assert_eq!(table_count(&pool, "scenarios").await, 1);
            assert_eq!(table_count(&pool, "tales").await, 3);
            assert_eq!(table_count(&pool, "tale_states").await, 3);
            assert_eq!(table_count(&pool, "tale_sessions").await, 3);
            assert_eq!(table_count(&pool, "tale_turns").await, 12);

            let scenario_components: String = sqlx::query_scalar(
                "SELECT components FROM scenarios WHERE id = 'scenario-iron-gate'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                sha256_text(&scenario_components),
                manifest["representativeContentHashes"]["scenario.components"]
                    .as_str()
                    .unwrap()
            );

            let arabic_story_cards: String = sqlx::query_scalar(
                "SELECT json_extract(state_json, '$.storyCards')
                 FROM tale_states WHERE tale_id = 'tale-arabic'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                sha256_text(&arabic_story_cards),
                manifest["representativeContentHashes"]["tale-arabic.story_cards"]
                    .as_str()
                    .unwrap()
            );

            let turn_entries: Vec<String> = sqlx::query_scalar(
                "SELECT entries_json FROM tale_turns
                 WHERE tale_id = 'tale-completed' ORDER BY seq",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            let reconstructed_log = Value::Array(
                turn_entries
                    .iter()
                    .flat_map(|entries| serde_json::from_str::<Vec<Value>>(entries).unwrap())
                    .collect(),
            );
            let legacy_log: String =
                sqlx::query_scalar("SELECT log FROM tales WHERE id = 'tale-completed'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                sha256_text(&legacy_log),
                manifest["representativeContentHashes"]["tale-completed.log"]
                    .as_str()
                    .unwrap()
            );
            assert_eq!(
                reconstructed_log,
                serde_json::from_str::<Value>(&legacy_log).unwrap()
            );

            let has_arabic: i64 = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM tale_states
                    WHERE tale_id = 'tale-arabic' AND state_json LIKE '%مريم%'
                 )",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(has_arabic, 1);
            pool.close().await;

            assert!(
                migration_backup::prepare_pre_migration_backup(&db_path, &root)
                    .await
                    .unwrap()
                    .is_none()
            );
            assert!(!root.join("migration-attempt.json").exists());
            assert!(root
                .join(format!(
                    "migration-attempt-{}.completed.json",
                    marker.attempt_id
                ))
                .exists());

            std::fs::copy(&marker.backup_path, &db_path).unwrap();
            assert_fixture_source_state(&db_path, &manifest).await;
            assert_eq!(
                std::fs::read(&db_path).unwrap(),
                std::fs::read(&marker.backup_path).unwrap()
            );

            std::fs::remove_dir_all(root).unwrap();
        });
    }

    async fn assert_fixture_source_state(db_path: &Path, manifest: &Value) {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_url(db_path))
            .await
            .unwrap();
        let version: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(version, 3);
        assert_eq!(table_count(&pool, "scenarios").await, 1);
        assert_eq!(table_count(&pool, "tales").await, 3);

        let components: String =
            sqlx::query_scalar("SELECT components FROM scenarios WHERE id = 'scenario-iron-gate'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            sha256_text(&components),
            manifest["representativeContentHashes"]["scenario.components"]
                .as_str()
                .unwrap()
        );
        pool.close().await;
    }

    async fn table_count(pool: &sqlx::SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .unwrap()
    }

    fn sha256_text(value: &str) -> String {
        format!("{:x}", Sha256::digest(value.as_bytes()))
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

        let backup_db_path = db_path.clone();
        let backup_app_data_dir = app_data_dir.clone();
        let mut recovery_error = run_async_command(async move {
            migration_backup::prepare_pre_migration_backup(&backup_db_path, &backup_app_data_dir)
                .await
        })
        .err()
        .map(|message| MigrationRecoveryStatus {
            message,
            app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        });

        if recovery_error.is_none() {
            let repair_db_path = db_path.clone();
            recovery_error = run_async_command(async move {
                repair_legacy_migration_checksums(&repair_db_path).await
            })
            .err()
            .map(|error| MigrationRecoveryStatus {
                message: format!("Unable to prepare the existing database migration: {error}"),
                app_data_dir: app_data_dir.to_string_lossy().into_owned(),
            });
        }

        app.manage(MigrationRecoveryState(recovery_error.clone()));
        if recovery_error.is_some() {
            return Ok(());
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
            migration_recovery_status,
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
