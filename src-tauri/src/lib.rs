// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    use tauri_plugin_sql::{ Migration, MigrationKind };

    tauri::Builder
        ::default()
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;

            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("hakawati.db");
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
                }
            ];

            app
                .handle()
                .plugin(
                    tauri_plugin_sql::Builder::new().add_migrations(&db_url, migrations).build()
                )?;

            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
