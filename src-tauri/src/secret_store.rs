const SERVICE_NAME: &str = "hakawati.sync";

pub fn hosted_refresh_token_account(profile_id: &str) -> String {
    format!("hosted:{profile_id}:refresh_token")
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod platform {
    use keyring::v1::{Entry, Error};

    use super::{hosted_refresh_token_account, SERVICE_NAME};

    fn entry(profile_id: &str) -> Result<Entry, String> {
        Entry::new(SERVICE_NAME, &hosted_refresh_token_account(profile_id))
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

#[cfg(any(target_os = "android", target_os = "ios"))]
mod platform {
    pub fn set(_profile_id: &str, _token: &str) -> Result<(), String> {
        Err("secure storage is not implemented on mobile yet".to_string())
    }

    pub fn get(_profile_id: &str) -> Result<Option<String>, String> {
        Err("secure storage is not implemented on mobile yet".to_string())
    }

    pub fn delete(_profile_id: &str) -> Result<(), String> {
        Ok(())
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
