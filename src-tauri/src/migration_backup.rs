use fs2::available_space;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::sqlite::SqlitePoolOptions;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufReader, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub const TARGET_SCHEMA_VERSION: i64 = 6;
const BACKUP_DIRECTORY: &str = "migration-backups";
const PENDING_MARKER_FILE: &str = "migration-attempt.json";
const MIN_FREE_SPACE_BUFFER_BYTES: u64 = 16 * 1024 * 1024;
const RETENTION_MILLIS: u128 = 30 * 24 * 60 * 60 * 1_000;
const MIN_RETAINED_BACKUPS: usize = 3;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationAttemptMarker {
    pub attempt_id: String,
    pub source_schema_version: i64,
    pub target_schema_version: i64,
    pub backup_path: PathBuf,
    pub manifest_path: PathBuf,
    pub created_at_unix_ms: u128,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MigrationBackupManifest {
    attempt_id: String,
    source_app_version_hint: String,
    created_by_app_version: String,
    source_schema_version: i64,
    target_schema_version: i64,
    source_database_path: PathBuf,
    backup_path: PathBuf,
    byte_size: u64,
    sha256: String,
    created_at_unix_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MigrationBackupFailurePoint {
    FreeSpace,
    DestinationCollision,
    PermissionDenied,
    BackupRename,
    MarkerWrite,
}

pub async fn prepare_pre_migration_backup(
    db_path: &Path,
    app_data_dir: &Path,
) -> Result<Option<MigrationAttemptMarker>, String> {
    prepare_pre_migration_backup_with_failure(db_path, app_data_dir, None).await
}

async fn prepare_pre_migration_backup_with_failure(
    db_path: &Path,
    app_data_dir: &Path,
    failure: Option<MigrationBackupFailurePoint>,
) -> Result<Option<MigrationAttemptMarker>, String> {
    if !db_path.exists() {
        return Ok(None);
    }

    let source_metadata = fs::metadata(db_path)
        .map_err(|error| format!("Unable to inspect the existing database: {error}"))?;
    if source_metadata.len() == 0 {
        return Ok(None);
    }

    let source_schema_version = read_schema_version(db_path).await?;
    let marker_path = app_data_dir.join(PENDING_MARKER_FILE);
    if source_schema_version >= TARGET_SCHEMA_VERSION {
        complete_pending_marker(&marker_path, app_data_dir)?;
        return Ok(None);
    }

    let backup_dir = app_data_dir.join(BACKUP_DIRECTORY);
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Unable to create the migration backup directory: {error}"))?;
    cleanup_stale_temporary_files(&backup_dir)?;

    if marker_path.exists() {
        let marker: MigrationAttemptMarker = read_json(&marker_path)?;
        validate_marker_paths(&marker, &backup_dir)?;
        if marker.source_schema_version != source_schema_version
            || marker.target_schema_version != TARGET_SCHEMA_VERSION
        {
            return Err(format!(
                "A previous migration attempt no longer matches the database schema (expected {} -> {}, found {} -> {}). Preserve the database and contact support before continuing.",
                marker.source_schema_version,
                marker.target_schema_version,
                source_schema_version,
                TARGET_SCHEMA_VERSION
            ));
        }
        validate_existing_backup(&marker).await?;
        return Ok(Some(marker));
    }

    fail_at(failure, MigrationBackupFailurePoint::FreeSpace)?;

    let required_space = source_metadata
        .len()
        .saturating_add(MIN_FREE_SPACE_BUFFER_BYTES);
    let free_space = available_space(&backup_dir)
        .map_err(|error| format!("Unable to check free space for the migration backup: {error}"))?;
    if free_space < required_space {
        return Err(format!(
            "Not enough free space to protect the existing database. At least {required_space} bytes are required, but only {free_space} bytes are available."
        ));
    }

    let created_at_unix_ms = now_unix_ms()?;
    let attempt_id = format!("{}-{}", std::process::id(), created_at_unix_ms);
    let backup_path = backup_dir.join(format!("migration-{attempt_id}.db"));
    let backup_temp_path = backup_dir.join(format!("migration-{attempt_id}.db.tmp"));
    let manifest_path = backup_dir.join(format!("migration-{attempt_id}.manifest.json"));
    let manifest_temp_path = backup_dir.join(format!("migration-{attempt_id}.manifest.json.tmp"));

    if failure == Some(MigrationBackupFailurePoint::DestinationCollision) {
        File::create(&backup_path).map_err(|error| {
            format!("Unable to inject a migration destination collision: {error}")
        })?;
    }

    ensure_absent(&backup_path)?;
    ensure_absent(&backup_temp_path)?;
    ensure_absent(&manifest_path)?;
    ensure_absent(&manifest_temp_path)?;

    fail_at(failure, MigrationBackupFailurePoint::PermissionDenied)?;
    create_consistent_snapshot(db_path, &backup_temp_path).await?;
    validate_integrity(&backup_temp_path).await?;
    sync_file(&backup_temp_path)?;

    let byte_size = fs::metadata(&backup_temp_path)
        .map_err(|error| format!("Unable to inspect the migration backup: {error}"))?
        .len();
    let sha256 = sha256_file(&backup_temp_path)?;
    let manifest = MigrationBackupManifest {
        attempt_id: attempt_id.clone(),
        source_app_version_hint: source_app_version_hint(source_schema_version).to_string(),
        created_by_app_version: env!("CARGO_PKG_VERSION").to_string(),
        source_schema_version,
        target_schema_version: TARGET_SCHEMA_VERSION,
        source_database_path: db_path.to_path_buf(),
        backup_path: backup_path.clone(),
        byte_size,
        sha256,
        created_at_unix_ms,
    };

    write_json_file(&manifest_temp_path, &manifest)?;
    fail_at(failure, MigrationBackupFailurePoint::BackupRename)?;
    fs::rename(&backup_temp_path, &backup_path)
        .map_err(|error| format!("Unable to finalize the migration backup: {error}"))?;
    fs::rename(&manifest_temp_path, &manifest_path)
        .map_err(|error| format!("Unable to finalize the migration backup manifest: {error}"))?;
    sync_directory(&backup_dir)?;

    let marker = MigrationAttemptMarker {
        attempt_id: attempt_id.clone(),
        source_schema_version,
        target_schema_version: TARGET_SCHEMA_VERSION,
        backup_path,
        manifest_path,
        created_at_unix_ms,
    };
    let marker_temp_path = app_data_dir.join(format!("{PENDING_MARKER_FILE}.{attempt_id}.tmp"));
    fail_at(failure, MigrationBackupFailurePoint::MarkerWrite)?;
    write_json_file(&marker_temp_path, &marker)?;
    fs::rename(&marker_temp_path, &marker_path)
        .map_err(|error| format!("Unable to record the migration recovery marker: {error}"))?;
    sync_directory(app_data_dir)?;

    if let Err(error) = prune_expired_backups(&backup_dir, created_at_unix_ms) {
        eprintln!("Unable to prune expired migration backups: {error}");
    }

    Ok(Some(marker))
}

fn fail_at(
    configured: Option<MigrationBackupFailurePoint>,
    current: MigrationBackupFailurePoint,
) -> Result<(), String> {
    if configured == Some(current) {
        let message = match current {
            MigrationBackupFailurePoint::FreeSpace => "Not enough free space",
            MigrationBackupFailurePoint::DestinationCollision => {
                "Migration recovery destination already exists"
            }
            MigrationBackupFailurePoint::PermissionDenied => {
                "Unable to create a consistent migration backup: permission denied"
            }
            MigrationBackupFailurePoint::BackupRename => {
                "Unable to finalize the migration backup"
            }
            MigrationBackupFailurePoint::MarkerWrite => {
                "Unable to record the migration recovery marker"
            }
        };
        return Err(message.to_string());
    }
    Ok(())
}

async fn read_schema_version(db_path: &Path) -> Result<i64, String> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(db_path))
        .await
        .map_err(|error| format!("Unable to open the existing database for backup: {error}"))?;
    let has_migrations_table: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|error| format!("Unable to inspect database migration history: {error}"))?;
    let version = if has_migrations_table.is_some() {
        sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
        )
        .fetch_one(&pool)
        .await
        .map_err(|error| format!("Unable to read the database schema version: {error}"))?
    } else {
        0
    };
    pool.close().await;
    Ok(version)
}

async fn create_consistent_snapshot(db_path: &Path, destination: &Path) -> Result<(), String> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(db_path))
        .await
        .map_err(|error| format!("Unable to open the existing database for backup: {error}"))?;
    let quoted_destination = destination.to_string_lossy().replace('\'', "''");
    let result = sqlx::query(&format!("VACUUM INTO '{quoted_destination}'"))
        .execute(&pool)
        .await;
    pool.close().await;
    result
        .map(|_| ())
        .map_err(|error| format!("Unable to create a consistent migration backup: {error}"))
}

async fn validate_existing_backup(marker: &MigrationAttemptMarker) -> Result<(), String> {
    if !marker.backup_path.exists() || !marker.manifest_path.exists() {
        return Err(
            "The recorded migration recovery backup is missing. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    let manifest: MigrationBackupManifest = read_json(&marker.manifest_path)?;
    if manifest.attempt_id != marker.attempt_id
        || manifest.source_schema_version != marker.source_schema_version
        || manifest.target_schema_version != marker.target_schema_version
        || manifest.backup_path != marker.backup_path
    {
        return Err(
            "The migration backup manifest does not match the recovery marker. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    let metadata = fs::metadata(&marker.backup_path)
        .map_err(|error| format!("Unable to inspect the recorded migration backup: {error}"))?;
    if metadata.len() != manifest.byte_size || sha256_file(&marker.backup_path)? != manifest.sha256
    {
        return Err(
            "The recorded migration recovery backup failed its hash check. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    validate_integrity(&marker.backup_path).await
}

fn validate_marker_paths(marker: &MigrationAttemptMarker, backup_dir: &Path) -> Result<(), String> {
    if !is_valid_attempt_id(&marker.attempt_id) {
        return Err(
            "The migration recovery marker contains an invalid attempt identifier. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    let expected_backup_path = backup_dir.join(format!("migration-{}.db", marker.attempt_id));
    let expected_manifest_path =
        backup_dir.join(format!("migration-{}.manifest.json", marker.attempt_id));
    if marker.backup_path != expected_backup_path || marker.manifest_path != expected_manifest_path
    {
        return Err(
            "The migration recovery marker points outside its controlled backup location. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    Ok(())
}

fn is_valid_attempt_id(attempt_id: &str) -> bool {
    let Some((process_id, timestamp)) = attempt_id.split_once('-') else {
        return false;
    };
    !process_id.is_empty()
        && !timestamp.is_empty()
        && process_id.bytes().all(|byte| byte.is_ascii_digit())
        && timestamp.bytes().all(|byte| byte.is_ascii_digit())
}

async fn validate_integrity(db_path: &Path) -> Result<(), String> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(db_path))
        .await
        .map_err(|error| {
            format!("Unable to open the migration backup for verification: {error}")
        })?;
    let result = sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .map_err(|error| format!("Unable to verify the migration backup: {error}"))?;
    pool.close().await;
    if result == "ok" {
        Ok(())
    } else {
        Err(format!(
            "The migration backup failed SQLite integrity_check: {result}"
        ))
    }
}

fn complete_pending_marker(marker_path: &Path, app_data_dir: &Path) -> Result<(), String> {
    if !marker_path.exists() {
        return Ok(());
    }
    let marker: MigrationAttemptMarker = read_json(marker_path)?;
    if !is_valid_attempt_id(&marker.attempt_id) {
        return Err(
            "The migration recovery marker contains an invalid attempt identifier. Preserve the database and contact support before continuing."
                .to_string(),
        );
    }
    let completed_path = app_data_dir.join(format!(
        "migration-attempt-{}.completed.json",
        marker.attempt_id
    ));
    if completed_path.exists() {
        fs::remove_file(marker_path)
            .map_err(|error| format!("Unable to clear the completed migration marker: {error}"))?;
    } else {
        fs::rename(marker_path, completed_path)
            .map_err(|error| format!("Unable to complete the migration marker: {error}"))?;
    }
    sync_directory(app_data_dir)
}

fn cleanup_stale_temporary_files(backup_dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(backup_dir)
        .map_err(|error| format!("Unable to inspect the migration backup directory: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Unable to inspect a migration backup entry: {error}"))?
            .path();
        if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(".tmp"))
        {
            fs::remove_file(&path).map_err(|error| {
                format!("Unable to remove stale backup temporary file: {error}")
            })?;
        }
    }
    Ok(())
}

fn prune_expired_backups(backup_dir: &Path, now_unix_ms: u128) -> Result<(), String> {
    let mut manifests = Vec::new();
    for entry in fs::read_dir(backup_dir)
        .map_err(|error| format!("Unable to inspect migration backup retention: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Unable to inspect a migration backup entry: {error}"))?
            .path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".manifest.json"))
        {
            if let Ok(manifest) = read_json::<MigrationBackupManifest>(&path) {
                if !is_valid_attempt_id(&manifest.attempt_id) {
                    continue;
                }
                let expected_manifest_path =
                    backup_dir.join(format!("migration-{}.manifest.json", manifest.attempt_id));
                let expected_backup_path =
                    backup_dir.join(format!("migration-{}.db", manifest.attempt_id));
                if path != expected_manifest_path || manifest.backup_path != expected_backup_path {
                    continue;
                }
                manifests.push((manifest.created_at_unix_ms, path, expected_backup_path));
            }
        }
    }
    manifests.sort_by(|left, right| right.0.cmp(&left.0));
    for (index, (created_at, manifest_path, backup_path)) in manifests.into_iter().enumerate() {
        if index < MIN_RETAINED_BACKUPS
            || now_unix_ms.saturating_sub(created_at) <= RETENTION_MILLIS
        {
            continue;
        }
        remove_file_if_present(&backup_path)?;
        remove_file_if_present(&manifest_path)?;
    }
    Ok(())
}

fn remove_file_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Unable to remove expired migration backup {}: {error}",
            path.display()
        )),
    }
}

fn write_json_file(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Unable to serialize migration recovery metadata: {error}"))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Unable to create migration recovery metadata: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("Unable to write migration recovery metadata: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Unable to flush migration recovery metadata: {error}"))
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Unable to read migration recovery metadata: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Migration recovery metadata is invalid: {error}"))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path)
        .map_err(|error| format!("Unable to open the migration backup for hashing: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Unable to hash the migration backup: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sync_file(path: &Path) -> Result<(), String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("Unable to flush the migration backup: {error}"))
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("Unable to flush the migration backup directory: {error}"))
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn ensure_absent(path: &Path) -> Result<(), String> {
    if path.exists() {
        Err(format!(
            "Migration recovery destination already exists: {}",
            path.display()
        ))
    } else {
        Ok(())
    }
}

fn source_app_version_hint(source_schema_version: i64) -> &'static str {
    if source_schema_version <= 3 {
        "v0.15.2-or-earlier"
    } else {
        "1.0-prerelease"
    }
}

fn now_unix_ms() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("System time is invalid: {error}"))
}

fn sqlite_url(db_path: &Path) -> String {
    format!("sqlite:{}", db_path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_reuses_a_verified_pre_migration_backup() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-success");
            let db_path = root.join("hakawati.db");
            create_database(&db_path, 3).await;

            let first = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();
            let second = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();

            assert_eq!(first, second);
            assert!(first.backup_path.exists());
            assert!(first.manifest_path.exists());
            let manifest: MigrationBackupManifest = read_json(&first.manifest_path).unwrap();
            assert_eq!(manifest.source_schema_version, 3);
            assert_eq!(manifest.target_schema_version, TARGET_SCHEMA_VERSION);
            assert_eq!(manifest.sha256.len(), 64);
            assert_eq!(
                read_sample_value(&first.backup_path).await,
                "مرحبا Hakawati"
            );

            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn rejects_a_corrupted_recorded_backup_without_changing_the_source() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-corrupt");
            let db_path = root.join("hakawati.db");
            create_database(&db_path, 3).await;
            let marker = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();
            fs::write(&marker.backup_path, b"corrupt").unwrap();

            let error = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap_err();
            assert!(error.contains("failed its hash check"));
            assert_eq!(read_sample_value(&db_path).await, "مرحبا Hakawati");

            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn rejects_a_marker_that_points_outside_the_backup_directory() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-marker-path");
            let db_path = root.join("hakawati.db");
            create_database(&db_path, 3).await;
            let mut marker = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();
            marker.backup_path = root.join("outside.db");
            fs::write(
                root.join(PENDING_MARKER_FILE),
                serde_json::to_vec_pretty(&marker).unwrap(),
            )
            .unwrap();

            let error = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap_err();
            assert!(error.contains("outside its controlled backup location"));
            assert_eq!(read_sample_value(&db_path).await, "مرحبا Hakawati");

            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn rejects_a_missing_recorded_backup_without_changing_the_source() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-missing-recorded");
            let db_path = root.join("hakawati.db");
            create_database(&db_path, 3).await;
            let marker = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();
            fs::remove_file(&marker.backup_path).unwrap();

            let error = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap_err();
            assert!(error.contains("recovery backup is missing"));
            assert_eq!(read_sample_value(&db_path).await, "مرحبا Hakawati");

            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn every_backup_barrier_failure_preserves_the_source_database() {
        for (point, expected) in [
            (MigrationBackupFailurePoint::FreeSpace, "free space"),
            (
                MigrationBackupFailurePoint::DestinationCollision,
                "destination already exists",
            ),
            (MigrationBackupFailurePoint::PermissionDenied, "permission denied"),
            (MigrationBackupFailurePoint::BackupRename, "finalize"),
            (MigrationBackupFailurePoint::MarkerWrite, "recovery marker"),
        ] {
            tauri::async_runtime::block_on(async {
                let root = unique_temp_directory(&format!("backup-failure-{point:?}"));
                let db_path = root.join("hakawati.db");
                create_database(&db_path, 3).await;
                let source_hash = sha256_file(&db_path).unwrap();
                let source_value = read_sample_value(&db_path).await;

                let error = prepare_pre_migration_backup_with_failure(
                    &db_path,
                    &root,
                    Some(point),
                )
                .await
                .unwrap_err();

                assert!(error.to_lowercase().contains(expected));
                assert_eq!(sha256_file(&db_path).unwrap(), source_hash);
                assert_eq!(read_sample_value(&db_path).await, source_value);
                assert!(!root.join(PENDING_MARKER_FILE).exists());
                fs::remove_dir_all(root).unwrap();
            });
        }
    }

    #[test]
    fn retention_keeps_at_least_the_three_newest_backups() {
        let root = unique_temp_directory("backup-retention");
        let backup_dir = root.join(BACKUP_DIRECTORY);
        fs::create_dir_all(&backup_dir).unwrap();
        let now = RETENTION_MILLIS + 10_000;
        let mut paths = Vec::new();

        for index in 1_u128..=4 {
            let attempt_id = format!("1-{index}");
            let backup_path = backup_dir.join(format!("migration-{attempt_id}.db"));
            let manifest_path = backup_dir.join(format!("migration-{attempt_id}.manifest.json"));
            fs::write(&backup_path, b"backup").unwrap();
            write_json_file(
                &manifest_path,
                &MigrationBackupManifest {
                    attempt_id,
                    source_app_version_hint: "test".to_string(),
                    created_by_app_version: "test".to_string(),
                    source_schema_version: 3,
                    target_schema_version: TARGET_SCHEMA_VERSION,
                    source_database_path: root.join("hakawati.db"),
                    backup_path: backup_path.clone(),
                    byte_size: 6,
                    sha256: "test".to_string(),
                    created_at_unix_ms: index,
                },
            )
            .unwrap();
            paths.push((backup_path, manifest_path));
        }

        prune_expired_backups(&backup_dir, now).unwrap();

        assert!(!paths[0].0.exists());
        assert!(!paths[0].1.exists());
        for (backup_path, manifest_path) in &paths[1..] {
            assert!(backup_path.exists());
            assert!(manifest_path.exists());
        }

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn completes_the_marker_after_the_target_schema_is_present() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-complete");
            let db_path = root.join("hakawati.db");
            create_database(&db_path, 3).await;
            let marker = prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .unwrap();

            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&sqlite_url(&db_path))
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO _sqlx_migrations (
                    version, description, success, checksum, execution_time
                 ) VALUES (?, 'target', 1, X'00', 0)",
            )
            .bind(TARGET_SCHEMA_VERSION)
            .execute(&pool)
            .await
            .unwrap();
            pool.close().await;

            assert!(prepare_pre_migration_backup(&db_path, &root)
                .await
                .unwrap()
                .is_none());
            assert!(!root.join(PENDING_MARKER_FILE).exists());
            assert!(root
                .join(format!(
                    "migration-attempt-{}.completed.json",
                    marker.attempt_id
                ))
                .exists());

            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn skips_a_missing_database() {
        tauri::async_runtime::block_on(async {
            let root = unique_temp_directory("backup-missing");
            assert!(
                prepare_pre_migration_backup(&root.join("missing.db"), &root)
                    .await
                    .unwrap()
                    .is_none()
            );
            fs::remove_dir_all(root).unwrap();
        });
    }

    async fn create_database(path: &Path, version: i64) {
        File::create(path).unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_url(path))
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
        sqlx::query(
            "INSERT INTO _sqlx_migrations (
                version, description, success, checksum, execution_time
             ) VALUES (?, 'source', 1, X'00', 0)",
        )
        .bind(version)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("CREATE TABLE sample (value TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sample (value) VALUES (?)")
            .bind("مرحبا Hakawati")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
    }

    async fn read_sample_value(path: &Path) -> String {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_url(path))
            .await
            .unwrap();
        let value = sqlx::query_scalar("SELECT value FROM sample")
            .fetch_one(&pool)
            .await
            .unwrap();
        pool.close().await;
        value
    }

    fn unique_temp_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "hakawati-{label}-{}-{}",
            std::process::id(),
            now_unix_ms().unwrap()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
