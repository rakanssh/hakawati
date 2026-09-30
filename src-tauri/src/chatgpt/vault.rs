//! Native-only credential storage. The OS keyring protects the encryption key;
//! the encrypted vault avoids Windows Credential Manager's small blob limit.
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{fs::File, io::Write, path::PathBuf};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(from = "StoredVault")]
pub(super) struct Vault {
    pub host_id: String,
    pub connection: Option<Connection>,
}

impl Vault {
    pub fn clear_tokens(&mut self) {
        if let Some(connection) = &mut self.connection {
            connection.tokens = None;
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Connection {
    pub id: String,
    pub client_id: String,
    pub subject: Option<String>,
    pub email: Option<String>,
    pub tokens: Option<Tokens>,
}

// Read the earlier multi-account format without losing an existing login. Only
// the selected connection survives; future saves use the single-account format.
#[derive(Deserialize)]
struct StoredVault {
    host_id: String,
    #[serde(default)]
    connection: Option<Connection>,
    #[serde(default)]
    active_profile_id: Option<String>,
    #[serde(default)]
    profiles: Vec<Connection>,
}

impl From<StoredVault> for Vault {
    fn from(stored: StoredVault) -> Self {
        let connection = stored.connection.or_else(|| {
            if let Some(active) = stored.active_profile_id {
                stored
                    .profiles
                    .into_iter()
                    .find(|connection| connection.id == active)
            } else {
                stored
                    .profiles
                    .into_iter()
                    .rev()
                    .find(|connection| connection.subject.is_none())
            }
        });
        Self {
            host_id: stored.host_id,
            connection,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub scope: String,
    pub expires_at: u64,
    pub earliest_refresh_at: Option<u64>,
}

pub(super) struct LockedVault {
    pub data: Vault,
    root: PathBuf,
    cipher: Aes256Gcm,
    // Held through token refresh + atomic save, including across app processes.
    _lock: File,
}

impl LockedVault {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&root).map_err(|_| "Cannot create ChatGPT credential directory")?;
        let lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("credentials.lock"))
            .map_err(|_| "Cannot open ChatGPT credential lock")?;
        lock.lock_exclusive()
            .map_err(|_| "Cannot lock ChatGPT credentials")?;
        let exists = root.join("credentials.enc").exists();
        let key = encryption_key(exists)?;
        Self::read(root, lock, &key)
    }

    fn read(root: PathBuf, lock: File, key: &[u8]) -> Result<Self, String> {
        let cipher =
            Aes256Gcm::new_from_slice(key).map_err(|_| "Invalid ChatGPT encryption key")?;
        let data = match std::fs::read(root.join("credentials.enc")) {
            Ok(bytes) => {
                if bytes.len() < 12 {
                    return Err("Invalid ChatGPT credential vault".into());
                }
                let decrypted = cipher
                    .decrypt(Nonce::from_slice(&bytes[..12]), &bytes[12..])
                    .map_err(|_| "Cannot unlock ChatGPT credentials with this OS account")?;
                serde_json::from_slice(&decrypted)
                    .map_err(|_| "Invalid ChatGPT credential vault")?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vault {
                host_id: format!("urn:uuid:{}", uuid::Uuid::new_v4()),
                ..Vault::default()
            },
            Err(_) => return Err("Cannot read ChatGPT credential vault".into()),
        };
        Ok(Self {
            data,
            root,
            cipher,
            _lock: lock,
        })
    }

    pub fn save(&self) -> Result<(), String> {
        let plaintext =
            serde_json::to_vec(&self.data).map_err(|_| "Cannot serialize ChatGPT credentials")?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let encrypted = self
            .cipher
            .encrypt(&nonce, plaintext.as_slice())
            .map_err(|_| "Cannot encrypt ChatGPT credentials")?;
        let temporary = self
            .root
            .join(format!("credentials-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            let mut file = File::options()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(&nonce)?;
            file.write_all(&encrypted)?;
            file.sync_all()?;
            std::fs::rename(&temporary, self.root.join("credentials.enc"))?;
            #[cfg(unix)]
            File::open(&self.root)?.sync_all()?;
            Ok::<(), std::io::Error>(())
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        result.map_err(|_| "Cannot save ChatGPT credentials securely".into())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn encryption_key(vault_exists: bool) -> Result<Vec<u8>, String> {
    use keyring::v1::{Entry, Error};
    let service = if cfg!(debug_assertions) {
        "hakawati.chatgpt.dev"
    } else {
        "hakawati.chatgpt"
    };
    let entry =
        Entry::new(service, "vault-key-v1").map_err(|_| "ChatGPT OS keyring is unavailable")?;
    match entry.get_password() {
        Ok(encoded) => STANDARD
            .decode(encoded)
            .map_err(|_| "Invalid ChatGPT OS keyring entry".into()),
        Err(Error::NoEntry) if !vault_exists => {
            let key = Aes256Gcm::generate_key(&mut OsRng);
            entry
                .set_password(&STANDARD.encode(key))
                .map_err(|_| "Cannot protect ChatGPT credentials in the OS keyring")?;
            Ok(key.to_vec())
        }
        Err(_) => Err("Cannot unlock ChatGPT credentials: OS keyring access is required".into()),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn encryption_key(_vault_exists: bool) -> Result<Vec<u8>, String> {
    Err("ChatGPT sign-in is available in the desktop app".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_existing_active_login_without_changing_tokens_or_host_id() {
        let token_set = serde_json::json!({
            "access_token": "active-access", "refresh_token": "active-refresh",
            "id_token": "active-identity", "scope": "chatgpt.tokens.use.direct",
            "expires_at": 1800000000, "earliest_refresh_at": null,
        });
        let data: Vault = serde_json::from_value(serde_json::json!({
            "host_id": "urn:uuid:existing-host",
            "active_profile_id": "active-account",
            "profiles": [
                { "id": "other-account", "client_id": "oaiapp_other", "subject": "other", "email": "other@example.com", "tokens": null },
                { "id": "active-account", "client_id": "oaiapp_active", "subject": "verified", "email": "active@example.com", "tokens": token_set },
            ],
        })).unwrap();
        assert_eq!(data.host_id, "urn:uuid:existing-host");
        let connection = data.connection.as_ref().unwrap();
        assert_eq!(connection.id, "active-account");
        assert_eq!(connection.client_id, "oaiapp_active");
        assert_eq!(connection.subject.as_deref(), Some("verified"));
        assert_eq!(connection.email.as_deref(), Some("active@example.com"));
        assert_eq!(
            serde_json::to_value(connection.tokens.as_ref().unwrap()).unwrap(),
            token_set
        );
        let saved = serde_json::to_value(&data).unwrap();
        assert!(saved.get("profiles").is_none());
        assert!(saved.get("active_profile_id").is_none());
        assert!(!saved.to_string().contains("other-account"));
        let reloaded: Vault = serde_json::from_value(saved.clone()).unwrap();
        assert_eq!(serde_json::to_value(reloaded).unwrap(), saved);
    }

    #[test]
    fn migrates_pending_registration_for_retry_and_preserves_it_after_sign_out() {
        let mut data: Vault = serde_json::from_value(serde_json::json!({
            "host_id": "urn:uuid:existing-host", "active_profile_id": null,
            "profiles": [{ "id": "pending", "client_id": "oaiapp_pending", "subject": null, "email": null, "tokens": null }],
        })).unwrap();
        assert_eq!(
            data.connection.as_ref().unwrap().client_id,
            "oaiapp_pending"
        );
        data.clear_tokens();
        let reloaded: Vault = serde_json::from_value(serde_json::to_value(data).unwrap()).unwrap();
        assert_eq!(reloaded.host_id, "urn:uuid:existing-host");
        assert_eq!(
            reloaded.connection.as_ref().unwrap().client_id,
            "oaiapp_pending"
        );
        assert!(reloaded.connection.as_ref().unwrap().tokens.is_none());
    }

    #[test]
    fn vault_encrypts_and_atomically_replaces_complete_token_sets() {
        let root =
            std::env::temp_dir().join(format!("hakawati-chatgpt-vault-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let key = Aes256Gcm::generate_key(&mut OsRng);
        let lock = File::create(root.join("lock")).unwrap();
        lock.lock_exclusive().unwrap();
        let contender = File::options()
            .read(true)
            .write(true)
            .open(root.join("lock"))
            .unwrap();
        let mut vault = LockedVault::read(root.clone(), lock, &key).unwrap();
        assert!(
            contender.try_lock_exclusive().is_err(),
            "another process must wait for refresh and persistence"
        );
        let host = vault.data.host_id.clone();
        vault.data.connection = Some(Connection {
            id: "connection".into(),
            client_id: "oaiapp_test".into(),
            subject: Some("subject".into()),
            email: None,
            tokens: Some(Tokens {
                access_token: "private-access-token".repeat(500),
                refresh_token: Some("refresh-old".into()),
                id_token: Some("id-secret".into()),
                scope: "chatgpt.tokens.use.direct".into(),
                expires_at: 100,
                earliest_refresh_at: None,
            }),
        });
        vault.save().unwrap();
        vault
            .data
            .connection
            .as_mut()
            .unwrap()
            .tokens
            .as_mut()
            .unwrap()
            .refresh_token = Some("refresh-new".into());
        vault.save().unwrap();
        let bytes = std::fs::read(root.join("credentials.enc")).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("private-access-token"));
        drop(vault);
        contender
            .try_lock_exclusive()
            .expect("refresh lock must release after persistence");
        FileExt::unlock(&contender).unwrap();
        drop(contender);
        let recovered =
            LockedVault::read(root.clone(), File::open(root.join("lock")).unwrap(), &key).unwrap();
        assert_eq!(recovered.data.host_id, host);
        assert_eq!(
            recovered
                .data
                .connection
                .as_ref()
                .unwrap()
                .tokens
                .as_ref()
                .unwrap()
                .refresh_token
                .as_deref(),
            Some("refresh-new")
        );
        drop(recovered);
        let wrong_key = Aes256Gcm::generate_key(&mut OsRng);
        assert!(LockedVault::read(
            root.clone(),
            File::open(root.join("lock")).unwrap(),
            &wrong_key
        )
        .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
