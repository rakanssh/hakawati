mod crypto;
#[cfg(all(test, not(windows)))]
mod ipc;
mod pairing;
mod recovery;

use base64::{engine::general_purpose::STANDARD, Engine};
use crypto::{CloudKey, Envelope, TalePurpose};
use pairing::{Direction, Payload, QrCode, Transcript};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use x25519_dalek::StaticSecret;

const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);

pub trait SecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, String>;
    fn set(&self, name: &str, value: &str) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}

#[cfg_attr(test, allow(dead_code))]
struct KeyringStore;

impl SecretStore for KeyringStore {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        use crate::secret_store::{keyring_entry, Error, SERVICE_NAME};
        let entry = keyring_entry(SERVICE_NAME, name).map_err(|_| "secret_store_unavailable")?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(Error::NoEntry) => Ok(None),
            Err(_) => Err("secret_store_unavailable".into()),
        }
    }

    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        crate::secret_store::keyring_entry(crate::secret_store::SERVICE_NAME, name)
            .and_then(|entry| entry.set_password(value))
            .map_err(|_| "secret_store_unavailable".into())
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        use crate::secret_store::{keyring_entry, Error, SERVICE_NAME};
        let entry = keyring_entry(SERVICE_NAME, name).map_err(|_| "secret_store_unavailable")?;
        match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(_) => Err("secret_store_unavailable".into()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    server_origin: String,
    account_id: String,
}

impl Scope {
    fn validate(&self) -> Result<(), String> {
        let valid = |value: &str| {
            !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
        };
        if valid(&self.server_origin) && valid(&self.account_id) {
            Ok(())
        } else {
            Err("cloud_key_scope_invalid".into())
        }
    }

    fn key_name(&self, key_id: &str) -> String {
        format!(
            "cloud-key:{}:{}:{}",
            self.server_origin, self.account_id, key_id
        )
    }

    fn record_name(&self) -> String {
        format!(
            "cloud-key-record:{}:{}",
            self.server_origin, self.account_id
        )
    }

    fn pending_name(&self) -> String {
        format!(
            "cloud-key-pending:{}:{}",
            self.server_origin, self.account_id
        )
    }
}

#[derive(Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecord {
    server_origin: String,
    account_id: String,
    key_id: String,
}

#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalKeyState {
    key_id: Option<String>,
    has_key: bool,
    pending_key_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupMaterial {
    key_id: String,
    key_check: String,
    recovery_wrapped_key: Envelope,
    recovery_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryMaterial {
    key_proof: String,
    recovery_wrapped_key: Envelope,
    recovery_key: String,
}

fn valid_key_id(key_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(key_id)
        .map(|_| ())
        .map_err(|_| "cloud_key_invalid".into())
}

struct Keys<'a, S: SecretStore> {
    store: &'a S,
}

impl<S: SecretStore> Keys<'_, S> {
    fn record(&self, scope: &Scope) -> Result<Option<String>, String> {
        let Some(value) = self.store.get(&scope.record_name())? else {
            return Ok(None);
        };
        let record: LocalRecord =
            serde_json::from_str(&value).map_err(|_| "cloud_key_record_invalid")?;
        if record.server_origin != scope.server_origin || record.account_id != scope.account_id {
            return Err("cloud_key_record_invalid".into());
        }
        Ok(Some(record.key_id))
    }

    fn load(&self, scope: &Scope, key_id: &str) -> Result<Option<CloudKey>, String> {
        valid_key_id(key_id)?;
        self.store
            .get(&scope.key_name(key_id))?
            .map(|value| crypto::decode_key(&value))
            .transpose()
    }

    fn require(&self, scope: &Scope, key_id: &str) -> Result<CloudKey, String> {
        if self.record(scope)?.as_deref() != Some(key_id) {
            return Err("cloud_key_missing".into());
        }
        self.load(scope, key_id)?
            .ok_or_else(|| "cloud_key_missing".into())
    }

    fn local(&self, scope: &Scope) -> Result<LocalKeyState, String> {
        scope.validate()?;
        let key_id = self.record(scope)?;
        let has_key = match &key_id {
            Some(key_id) => self.load(scope, key_id)?.is_some(),
            None => false,
        };
        Ok(LocalKeyState {
            key_id,
            has_key,
            pending_key_id: self.store.get(&scope.pending_name())?,
        })
    }

    fn save(&self, scope: &Scope, key_id: &str, key: &CloudKey) -> Result<(), String> {
        self.store
            .set(&scope.key_name(key_id), &STANDARD.encode(key))?;
        let record = serde_json::to_string(&LocalRecord {
            server_origin: scope.server_origin.clone(),
            account_id: scope.account_id.clone(),
            key_id: key_id.into(),
        })
        .map_err(|_| "cloud_key_record_invalid")?;
        self.store.set(&scope.record_name(), &record)?;
        if self.store.get(&scope.pending_name())?.as_deref() == Some(key_id) {
            self.store.delete(&scope.pending_name())?;
        }
        Ok(())
    }

    fn accept(
        &self,
        scope: &Scope,
        key_id: &str,
        key: &CloudKey,
        key_check: &str,
    ) -> Result<(), String> {
        scope.validate()?;
        valid_key_id(key_id)?;
        if crypto::key_check(key, key_id) != key_check {
            return Err("cloud_key_check_failed".into());
        }
        self.save(scope, key_id, key)
    }

    fn begin_setup(&self, scope: &Scope) -> Result<SetupMaterial, String> {
        scope.validate()?;
        self.discard_pending(scope)?;
        let key_id = uuid::Uuid::new_v4().to_string();
        let key = crypto::random_bytes::<32>();
        let secret = recovery::generate();
        self.store
            .set(&scope.key_name(&key_id), &STANDARD.encode(key))?;
        self.store.set(&scope.pending_name(), &key_id)?;
        Ok(SetupMaterial {
            key_check: crypto::key_check(&key, &key_id),
            recovery_wrapped_key: recovery::wrap(&secret, &scope.account_id, &key_id, &key),
            recovery_key: recovery::format(&secret),
            key_id,
        })
    }

    fn adopt(&self, scope: &Scope, key_id: &str, key_check: &str) -> Result<bool, String> {
        scope.validate()?;
        let Some(key) = self.load(scope, key_id)? else {
            return Ok(false);
        };
        match self.accept(scope, key_id, &key, key_check) {
            Ok(()) => Ok(true),
            Err(error) if error == "cloud_key_check_failed" => Ok(false),
            Err(error) => Err(error),
        }
    }

    fn discard_pending(&self, scope: &Scope) -> Result<(), String> {
        let Some(pending) = self.store.get(&scope.pending_name())? else {
            return Ok(());
        };
        if valid_key_id(&pending).is_ok() && self.record(scope)?.as_deref() != Some(&pending) {
            self.store.delete(&scope.key_name(&pending))?;
        }
        self.store.delete(&scope.pending_name())
    }

    fn forget(&self, scope: &Scope) -> Result<(), String> {
        scope.validate()?;
        self.discard_pending(scope)?;
        if let Some(key_id) = self.record(scope).ok().flatten() {
            if valid_key_id(&key_id).is_ok() {
                self.store.delete(&scope.key_name(&key_id))?;
            }
        }
        self.store.delete(&scope.record_name())
    }

    fn recover(
        &self,
        scope: &Scope,
        key_id: &str,
        key_check: &str,
        wrapped: &Envelope,
        recovery_key: &str,
    ) -> Result<(), String> {
        scope.validate()?;
        valid_key_id(key_id)?;
        let secret = recovery::parse(recovery_key)?;
        let key = recovery::unwrap(&secret, &scope.account_id, key_id, wrapped)?;
        self.accept(scope, key_id, &key, key_check)
    }

    fn new_recovery(&self, scope: &Scope, key_id: &str) -> Result<RecoveryMaterial, String> {
        let key = self.require(scope, key_id)?;
        let secret = recovery::generate();
        Ok(RecoveryMaterial {
            key_proof: STANDARD.encode(crypto::key_proof(&key, key_id)),
            recovery_wrapped_key: recovery::wrap(&secret, &scope.account_id, key_id, &key),
            recovery_key: recovery::format(&secret),
        })
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Role {
    Shower,
    Scanner,
}

struct Session {
    scope: Scope,
    role: Role,
    direction: Direction,
    pairing_id: [u8; 16],
    own: StaticSecret,
    peer: Option<[u8; 32]>,
    shower_public: [u8; 32],
    secret: [u8; 32],
    keys: Option<pairing::Keys>,
    created: Instant,
}

impl Session {
    fn derive(&mut self, peer: [u8; 32]) -> Result<&pairing::Keys, String> {
        let scanner_public = match self.role {
            Role::Shower => peer,
            Role::Scanner => pairing::public_key(&self.own),
        };
        let keys = pairing::derive(
            &self.own,
            &peer,
            &Transcript {
                account_id: &self.scope.account_id,
                pairing_id: &self.pairing_id,
                direction: self.direction,
                shower_public: &self.shower_public,
                scanner_public: &scanner_public,
                secret: &self.secret,
            },
        )?;
        self.peer = Some(peer);
        Ok(self.keys.insert(keys))
    }

    fn keys(&self) -> Result<&pairing::Keys, String> {
        self.keys
            .as_ref()
            .ok_or_else(|| "pairing_state_invalid".into())
    }
}

#[derive(Default)]
pub struct CloudKeyState {
    pairings: Mutex<HashMap<String, Session>>,
}

impl CloudKeyState {
    fn with_session<T>(
        &self,
        pairing_id: &str,
        work: impl FnOnce(&mut Session) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut pairings = self
            .pairings
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        pairings.retain(|_, session| session.created.elapsed() < PAIRING_TTL);
        let session = pairings
            .get_mut(pairing_id)
            .ok_or_else(|| "pairing_expired".to_string())?;
        work(session)
    }

    fn insert(&self, pairing_id: String, session: Session) {
        let mut pairings = self
            .pairings
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        pairings.retain(|_, session| session.created.elapsed() < PAIRING_TTL);
        pairings.insert(pairing_id, session);
    }
}

fn pairing_uuid(value: &str) -> Result<uuid::Uuid, String> {
    uuid::Uuid::parse_str(value).map_err(|_| "pairing_code_invalid".into())
}

fn decode_public_key(value: &str) -> Result<[u8; 32], String> {
    crypto::decode_base64(value)?
        .try_into()
        .map_err(|_| "pairing_key_invalid".into())
}

#[cfg(not(test))]
fn store() -> KeyringStore {
    KeyringStore
}

#[cfg(test)]
fn store() -> tests::SharedStore {
    tests::SharedStore
}

#[tauri::command(async)]
pub fn cloud_key_local(scope: Scope) -> Result<LocalKeyState, String> {
    Keys { store: &store() }.local(&scope)
}

#[tauri::command(async)]
pub fn cloud_key_begin_setup(scope: Scope) -> Result<SetupMaterial, String> {
    Keys { store: &store() }.begin_setup(&scope)
}

#[tauri::command(async)]
pub fn cloud_key_adopt(scope: Scope, key_id: String, key_check: String) -> Result<bool, String> {
    Keys { store: &store() }.adopt(&scope, &key_id, &key_check)
}

#[tauri::command(async)]
pub fn cloud_key_discard_pending(scope: Scope) -> Result<(), String> {
    scope.validate()?;
    Keys { store: &store() }.discard_pending(&scope)
}

#[tauri::command(async)]
pub fn cloud_key_forget(scope: Scope) -> Result<(), String> {
    Keys { store: &store() }.forget(&scope)
}

#[tauri::command(async)]
pub fn cloud_key_proof(scope: Scope, key_id: String) -> Result<String, String> {
    let key = Keys { store: &store() }.require(&scope, &key_id)?;
    Ok(STANDARD.encode(crypto::key_proof(&key, &key_id)))
}

#[tauri::command(async)]
pub fn cloud_key_new_recovery(scope: Scope, key_id: String) -> Result<RecoveryMaterial, String> {
    Keys { store: &store() }.new_recovery(&scope, &key_id)
}

#[tauri::command(async)]
pub fn cloud_key_recover(
    scope: Scope,
    key_id: String,
    key_check: String,
    recovery_wrapped_key: Envelope,
    recovery_key: String,
) -> Result<(), String> {
    Keys { store: &store() }.recover(
        &scope,
        &key_id,
        &key_check,
        &recovery_wrapped_key,
        &recovery_key,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaleRevision {
    tale_id: String,
    content_rev: u64,
    metadata_rev: u64,
}

#[derive(Serialize)]
pub struct EncryptedTale {
    summary: Envelope,
    package: Envelope,
}

fn seal_tale(
    key: &CloudKey,
    scope: &Scope,
    key_id: &str,
    revision: &TaleRevision,
    summary: &str,
    package: &str,
) -> EncryptedTale {
    let aad = |purpose| {
        crypto::tale_aad(
            key_id,
            &scope.account_id,
            &revision.tale_id,
            purpose,
            revision.content_rev,
            revision.metadata_rev,
        )
    };
    EncryptedTale {
        summary: crypto::seal_envelope(key, key_id, summary.as_bytes(), &aad(TalePurpose::Summary)),
        package: crypto::seal_envelope(key, key_id, package.as_bytes(), &aad(TalePurpose::Package)),
    }
}

fn open_tale_part(
    key: &CloudKey,
    scope: &Scope,
    key_id: &str,
    revision: &TaleRevision,
    purpose: TalePurpose,
    envelope: &Envelope,
) -> Result<String, String> {
    let plaintext = crypto::open_envelope(
        key,
        key_id,
        envelope,
        &crypto::tale_aad(
            key_id,
            &scope.account_id,
            &revision.tale_id,
            purpose,
            revision.content_rev,
            revision.metadata_rev,
        ),
    )?;
    String::from_utf8(plaintext).map_err(|_| "decrypt_failed".into())
}

#[tauri::command(async)]
pub fn cloud_tale_encrypt(
    scope: Scope,
    key_id: String,
    revision: TaleRevision,
    summary: String,
    package: String,
) -> Result<EncryptedTale, String> {
    let key = Keys { store: &store() }.require(&scope, &key_id)?;
    Ok(seal_tale(
        &key, &scope, &key_id, &revision, &summary, &package,
    ))
}

#[derive(Serialize)]
pub struct DecryptedTale {
    summary: String,
    package: String,
}

#[tauri::command(async)]
pub fn cloud_tale_decrypt(
    scope: Scope,
    key_id: String,
    revision: TaleRevision,
    summary: Envelope,
    package: Envelope,
) -> Result<DecryptedTale, String> {
    let key = Keys { store: &store() }.require(&scope, &key_id)?;
    Ok(DecryptedTale {
        summary: open_tale_part(
            &key,
            &scope,
            &key_id,
            &revision,
            TalePurpose::Summary,
            &summary,
        )?,
        package: open_tale_part(
            &key,
            &scope,
            &key_id,
            &revision,
            TalePurpose::Package,
            &package,
        )?,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedSummary {
    #[serde(flatten)]
    revision: TaleRevision,
    summary: Envelope,
}

#[tauri::command(async)]
pub fn cloud_summaries_decrypt(
    scope: Scope,
    key_id: String,
    items: Vec<EncryptedSummary>,
) -> Result<Vec<Option<String>>, String> {
    let key = Keys { store: &store() }.require(&scope, &key_id)?;
    Ok(items
        .iter()
        .map(|item| {
            open_tale_part(
                &key,
                &scope,
                &key_id,
                &item.revision,
                TalePurpose::Summary,
                &item.summary,
            )
            .ok()
        })
        .collect())
}

#[tauri::command(async)]
pub fn cloud_cover_encrypt(
    scope: Scope,
    key_id: String,
    asset_id: String,
    image_base64: String,
) -> Result<String, String> {
    let key = Keys { store: &store() }.require(&scope, &key_id)?;
    uuid::Uuid::parse_str(&asset_id).map_err(|_| "cover_asset_invalid")?;
    let image = crypto::decode_base64(&image_base64)?;
    Ok(STANDARD.encode(crypto::seal_cover(
        &key,
        &key_id,
        &scope.account_id,
        &asset_id.to_lowercase(),
        &image,
    )))
}

#[tauri::command(async)]
pub fn cloud_pairing_show(
    state: tauri::State<'_, CloudKeyState>,
    scope: Scope,
    pairing_id: String,
    direction: Direction,
) -> Result<String, String> {
    scope.validate()?;
    let id = pairing_uuid(&pairing_id)?;
    let own = pairing::generate_secret();
    let qr = QrCode {
        direction,
        pairing_id: *id.as_bytes(),
        shower_public: pairing::public_key(&own),
        secret: crypto::random_bytes::<32>(),
    };
    let encoded = qr.encode();
    state.insert(
        id.to_string(),
        Session {
            scope,
            role: Role::Shower,
            direction,
            pairing_id: qr.pairing_id,
            own,
            peer: None,
            shower_public: qr.shower_public,
            secret: qr.secret,
            keys: None,
            created: Instant::now(),
        },
    );
    Ok(encoded)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPairing {
    pairing_id: String,
    direction: Direction,
    scanner_public_key: String,
    scanner_confirm: String,
    code: String,
}

#[tauri::command(async)]
pub fn cloud_pairing_scan(
    state: tauri::State<'_, CloudKeyState>,
    scope: Scope,
    code: String,
) -> Result<ScannedPairing, String> {
    scope.validate()?;
    let qr = QrCode::decode(&code)?;
    let pairing_id = uuid::Uuid::from_bytes(qr.pairing_id).to_string();
    let own = pairing::generate_secret();
    let scanner_public = pairing::public_key(&own);
    let mut session = Session {
        scope,
        role: Role::Scanner,
        direction: qr.direction,
        pairing_id: qr.pairing_id,
        own,
        peer: None,
        shower_public: qr.shower_public,
        secret: qr.secret,
        keys: None,
        created: Instant::now(),
    };
    let keys = session.derive(qr.shower_public)?;
    let scanned = ScannedPairing {
        pairing_id: pairing_id.clone(),
        direction: qr.direction,
        scanner_public_key: STANDARD.encode(scanner_public),
        scanner_confirm: keys.scanner_confirm(),
        code: keys.code.clone(),
    };
    state.insert(pairing_id, session);
    Ok(scanned)
}

#[tauri::command(async)]
pub fn cloud_pairing_confirm(
    state: tauri::State<'_, CloudKeyState>,
    pairing_id: String,
    scanner_public_key: String,
    scanner_confirm: String,
) -> Result<String, String> {
    let peer = decode_public_key(&scanner_public_key)?;
    state.with_session(&pairing_id, |session| {
        if session.role != Role::Shower {
            return Err("pairing_state_invalid".into());
        }
        if session.peer.is_some_and(|known| known != peer) {
            return Err("pairing_confirm_failed".into());
        }
        let keys = session.derive(peer)?;
        keys.verify_scanner_confirm(&scanner_confirm)?;
        Ok(keys.code.clone())
    })
}

fn sender_role(direction: Direction) -> Role {
    match direction {
        Direction::Send => Role::Shower,
        Direction::Receive => Role::Scanner,
    }
}

#[tauri::command(async)]
pub fn cloud_pairing_seal(
    state: tauri::State<'_, CloudKeyState>,
    pairing_id: String,
    key_id: String,
) -> Result<Payload, String> {
    state.with_session(&pairing_id, |session| {
        if session.role != sender_role(session.direction) {
            return Err("pairing_state_invalid".into());
        }
        let key = Keys { store: &store() }.require(&session.scope, &key_id)?;
        Ok(session.keys()?.seal(&key_id, &key))
    })
}

#[tauri::command(async)]
pub fn cloud_pairing_open(
    state: tauri::State<'_, CloudKeyState>,
    pairing_id: String,
    key_id: String,
    key_check: String,
    payload: Payload,
) -> Result<(), String> {
    state.with_session(&pairing_id, |session| {
        if session.role == sender_role(session.direction) {
            return Err("pairing_state_invalid".into());
        }
        let (received_key_id, key) = session.keys()?.open(&payload)?;
        if received_key_id != key_id {
            return Err("cloud_key_check_failed".into());
        }
        Keys { store: &store() }.accept(&session.scope, &key_id, &key, &key_check)
    })
}

#[tauri::command(async)]
pub fn cloud_pairing_end(state: tauri::State<'_, CloudKeyState>, pairing_id: String) {
    state
        .pairings
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(&pairing_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    static SHARED: Mutex<BTreeMap<String, String>> = Mutex::new(BTreeMap::new());

    pub(super) struct SharedStore;

    impl SecretStore for SharedStore {
        fn get(&self, name: &str) -> Result<Option<String>, String> {
            Ok(SHARED.lock().unwrap().get(name).cloned())
        }
        fn set(&self, name: &str, value: &str) -> Result<(), String> {
            SHARED.lock().unwrap().insert(name.into(), value.into());
            Ok(())
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            SHARED.lock().unwrap().remove(name);
            Ok(())
        }
    }

    #[derive(Default)]
    struct MemoryStore(RefCell<HashMap<String, String>>);

    impl SecretStore for MemoryStore {
        fn get(&self, name: &str) -> Result<Option<String>, String> {
            Ok(self.0.borrow().get(name).cloned())
        }
        fn set(&self, name: &str, value: &str) -> Result<(), String> {
            self.0.borrow_mut().insert(name.into(), value.into());
            Ok(())
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            self.0.borrow_mut().remove(name);
            Ok(())
        }
    }

    fn scope() -> Scope {
        Scope {
            server_origin: "https://sync.example".into(),
            account_id: "acct-1".into(),
        }
    }

    #[test]
    fn setup_stays_pending_until_the_server_accepts_the_key() {
        let store = MemoryStore::default();
        let keys = Keys { store: &store };
        let setup = keys.begin_setup(&scope()).unwrap();
        assert_eq!(setup.recovery_key.len(), 34);
        assert_eq!(setup.recovery_wrapped_key.key_id, setup.key_id);
        assert_eq!(
            keys.local(&scope()).unwrap(),
            LocalKeyState {
                key_id: None,
                has_key: false,
                pending_key_id: Some(setup.key_id.clone()),
            }
        );
        assert!(store.0.borrow().contains_key(&format!(
            "cloud-key:https://sync.example:acct-1:{}",
            setup.key_id
        )));
        assert!(keys.require(&scope(), &setup.key_id).is_err());

        assert!(!keys.adopt(&scope(), &setup.key_id, "wrong-check").unwrap());
        assert!(keys
            .adopt(&scope(), &setup.key_id, &setup.key_check)
            .unwrap());
        assert_eq!(
            keys.local(&scope()).unwrap(),
            LocalKeyState {
                key_id: Some(setup.key_id.clone()),
                has_key: true,
                pending_key_id: None,
            }
        );
        let record: LocalRecord = serde_json::from_str(
            &store
                .get("cloud-key-record:https://sync.example:acct-1")
                .unwrap()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(record.key_id, setup.key_id);
        assert!(keys.require(&scope(), &setup.key_id).is_ok());
    }

    #[test]
    fn discarding_a_lost_setup_removes_only_its_key() {
        let store = MemoryStore::default();
        let keys = Keys { store: &store };
        let first = keys.begin_setup(&scope()).unwrap();
        keys.adopt(&scope(), &first.key_id, &first.key_check)
            .unwrap();
        let second = keys.begin_setup(&scope()).unwrap();
        keys.discard_pending(&scope()).unwrap();
        let local = keys.local(&scope()).unwrap();
        assert_eq!(local.key_id.as_deref(), Some(first.key_id.as_str()));
        assert!(local.has_key);
        assert_eq!(local.pending_key_id, None);
        assert_eq!(keys.load(&scope(), &second.key_id).unwrap(), None);
    }

    #[test]
    fn recovers_on_a_new_device_and_replaces_the_recovery_key() {
        let phone = MemoryStore::default();
        let keys = Keys { store: &phone };
        let setup = keys.begin_setup(&scope()).unwrap();
        keys.adopt(&scope(), &setup.key_id, &setup.key_check)
            .unwrap();

        let desktop = MemoryStore::default();
        let other = Keys { store: &desktop };
        assert_eq!(
            other.recover(
                &scope(),
                &setup.key_id,
                &setup.key_check,
                &setup.recovery_wrapped_key,
                "0000-0000-0000-0000-0000-0000-0000",
            ),
            Err("recovery_key_invalid".into())
        );
        let other_account = Scope {
            account_id: "acct-2".into(),
            ..scope()
        };
        assert_eq!(
            other.recover(
                &other_account,
                &setup.key_id,
                &setup.key_check,
                &setup.recovery_wrapped_key,
                &setup.recovery_key,
            ),
            Err("recovery_key_mismatch".into())
        );
        other
            .recover(
                &scope(),
                &setup.key_id,
                &setup.key_check,
                &setup.recovery_wrapped_key,
                &setup.recovery_key.to_lowercase(),
            )
            .unwrap();
        assert_eq!(
            other.require(&scope(), &setup.key_id).unwrap(),
            keys.require(&scope(), &setup.key_id).unwrap()
        );

        let replacement = keys.new_recovery(&scope(), &setup.key_id).unwrap();
        assert_eq!(
            replacement.key_proof,
            STANDARD.encode(crypto::key_proof(
                &keys.require(&scope(), &setup.key_id).unwrap(),
                &setup.key_id
            ))
        );
        let third = MemoryStore::default();
        let third = Keys { store: &third };
        assert!(third
            .recover(
                &scope(),
                &setup.key_id,
                &setup.key_check,
                &replacement.recovery_wrapped_key,
                &setup.recovery_key,
            )
            .is_err());
        third
            .recover(
                &scope(),
                &setup.key_id,
                &setup.key_check,
                &replacement.recovery_wrapped_key,
                &replacement.recovery_key,
            )
            .unwrap();
    }

    #[test]
    fn rejects_a_key_that_fails_the_server_key_check() {
        let store = MemoryStore::default();
        let keys = Keys { store: &store };
        let key_id = uuid::Uuid::new_v4().to_string();
        let key = crypto::random_bytes::<32>();
        let other = crypto::random_bytes::<32>();
        assert_eq!(
            keys.accept(&scope(), &key_id, &other, &crypto::key_check(&key, &key_id)),
            Err("cloud_key_check_failed".into())
        );
        assert_eq!(keys.local(&scope()).unwrap(), LocalKeyState::default());
        keys.forget(&scope()).unwrap();
    }

    #[test]
    fn tales_are_bound_to_account_tale_and_revisions() {
        let key = crypto::random_bytes::<32>();
        let key_id = uuid::Uuid::new_v4().to_string();
        let revision = TaleRevision {
            tale_id: "tale-1".into(),
            content_rev: 3,
            metadata_rev: 4,
        };
        let sealed = seal_tale(
            &key,
            &scope(),
            &key_id,
            &revision,
            "{\"title\":\"T\"}",
            "{}",
        );
        assert_eq!(
            open_tale_part(
                &key,
                &scope(),
                &key_id,
                &revision,
                TalePurpose::Summary,
                &sealed.summary
            )
            .unwrap(),
            "{\"title\":\"T\"}"
        );
        assert!(open_tale_part(
            &key,
            &scope(),
            &key_id,
            &revision,
            TalePurpose::Package,
            &sealed.summary
        )
        .is_err());
        let rolled_back = TaleRevision {
            content_rev: 2,
            ..revision
        };
        assert!(open_tale_part(
            &key,
            &scope(),
            &key_id,
            &rolled_back,
            TalePurpose::Package,
            &sealed.package
        )
        .is_err());
        let other_account = Scope {
            account_id: "acct-2".into(),
            ..scope()
        };
        assert!(open_tale_part(
            &key,
            &other_account,
            &key_id,
            &rolled_back,
            TalePurpose::Package,
            &sealed.package
        )
        .is_err());
    }
}
