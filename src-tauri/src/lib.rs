mod oauth_loopback;
mod speech_recorder;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        let db_url = format!("sqlite:{}", db_path.to_string_lossy());

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
                description: "sync_profile_controls",
                sql: include_str!("../migrations/006_sync_profile_controls.sql"),
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
            speech_recorder::start_speech_recording,
            speech_recorder::stop_speech_recording,
            speech_recorder::get_speech_recording_level,
            speech_recorder::cancel_speech_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
