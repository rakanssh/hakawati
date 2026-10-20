const SERVICE_NAME: &str = "hakawati.sync";

pub fn hosted_refresh_token_account(profile_id: &str) -> String {
    format!("hosted:{profile_id}:refresh_token")
}

// Desktop uses the OS keyring. Android keeps secrets in a private SharedPreferences
// file, encrypted with an AES key that is generated inside the Android Keystore.
// iOS keeps them in the app's own Keychain, on this device only.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) use keyring::v1::{Entry, Error};
#[cfg(any(target_os = "android", target_os = "ios"))]
pub(crate) use keyring_core::{Entry, Error};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn keyring_entry(service: &str, user: &str) -> Result<Entry, Error> {
    Entry::new(service, user)
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub(crate) fn keyring_entry(service: &str, user: &str) -> Result<Entry, Error> {
    static STORE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let guard = STORE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if keyring_core::get_default_store().is_none() {
        #[cfg(target_os = "android")]
        keyring_core::set_default_store(android_native_keyring_store::Store::new()?);
        #[cfg(target_os = "ios")]
        keyring_core::set_default_store(apple_native_keyring_store::protected::Store::new()?);
    }
    drop(guard);
    Entry::new(service, user)
}

mod platform {
    use super::{hosted_refresh_token_account, keyring_entry, Entry, Error, SERVICE_NAME};

    fn entry(profile_id: &str) -> Result<Entry, String> {
        keyring_entry(SERVICE_NAME, &hosted_refresh_token_account(profile_id))
            .map_err(|error| error.to_string())
    }

    pub fn set(profile_id: &str, token: &str) -> Result<(), String> {
        entry(profile_id)?
            .set_password(token)
            .map_err(|error| error.to_string())
    }

    pub fn get(profile_id: &str) -> Result<Option<String>, String> {
        match entry(profile_id)?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn delete(profile_id: &str) -> Result<(), String> {
        match entry(profile_id)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[tauri::command]
pub fn set_hosted_refresh_token(profile_id: String, token: String) -> Result<(), String> {
    platform::set(&profile_id, &token)
}

#[tauri::command]
pub fn get_hosted_refresh_token(profile_id: String) -> Result<Option<String>, String> {
    platform::get(&profile_id)
}

#[tauri::command]
pub fn delete_hosted_refresh_token(profile_id: String) -> Result<(), String> {
    platform::delete(&profile_id)
}

#[cfg(test)]
mod tests {
    use super::hosted_refresh_token_account;

    #[test]
    fn hosted_refresh_token_key_is_profile_scoped() {
        assert_eq!(
            hosted_refresh_token_account("hosted"),
            "hosted:hosted:refresh_token"
        );
    }
}
