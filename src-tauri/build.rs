fn main() {
    #[cfg(target_os = "macos")]
    link_ios_plugins();

    tauri_build::build()
}

/// Hakawati's own iOS plugins live in a Swift package (ios/Plugins). Build it
/// against Tauri's Swift API the way Tauri plugins are built: the package expects
/// that API copied next to it in ios/.tauri/tauri-api.
#[cfg(target_os = "macos")]
fn link_ios_plugins() {
    use std::path::{Path, PathBuf};

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("ios") {
        return;
    }

    fn copy_dir(source: &Path, target: &Path) {
        std::fs::create_dir_all(target).expect("failed to create the Tauri Swift API copy");
        for entry in std::fs::read_dir(source).expect("failed to read the Tauri Swift API") {
            let entry = entry.unwrap();
            let name = entry.file_name();
            if [".build", "Package.resolved", "Tests"].contains(&name.to_str().unwrap_or("")) {
                continue;
            }
            let destination = target.join(&name);
            if entry.file_type().unwrap().is_dir() {
                copy_dir(&entry.path(), &destination);
            } else {
                std::fs::copy(entry.path(), destination)
                    .expect("failed to copy the Tauri Swift API");
            }
        }
    }

    let tauri_api = std::env::var("DEP_TAURI_IOS_LIBRARY_PATH")
        .expect("missing DEP_TAURI_IOS_LIBRARY_PATH; tauri must be a direct dependency");
    let ios = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("ios");
    let api_copy = ios.join(".tauri").join("tauri-api");
    let _ = std::fs::remove_dir_all(&api_copy);
    copy_dir(Path::new(&tauri_api), &api_copy);

    println!("cargo:rerun-if-changed=ios/Plugins");
    tauri_utils::build::link_apple_library("HakawatiPlugins", ios.join("Plugins"));
}
