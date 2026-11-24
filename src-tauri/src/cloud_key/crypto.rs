use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const SCHEME: &str = "client-v1";
pub const ALG: &str = "aes-256-gcm";
pub const KEY_BYTES: usize = 32;
pub const NONCE_BYTES: usize = 12;
pub const TAG_BYTES: usize = 16;

pub type CloudKey = [u8; KEY_BYTES];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub v: u8,
    pub scheme: String,
    pub alg: String,
    pub key_id: String,
    pub nonce: String,
    pub ciphertext: String,
    pub tag: String,
}

#[derive(Clone, Copy)]
pub enum TalePurpose {
    Package,
    Summary,
}

impl TalePurpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::Package => "tale.package",
            Self::Summary => "tale.summary",
        }
    }
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

pub fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(value)
        .map_err(|_| "invalid_base64".to_string())
}

pub fn decode_key(value: &str) -> Result<CloudKey, String> {
    decode_base64(value)?
        .try_into()
        .map_err(|_| "cloud_key_invalid".to_string())
}

pub fn key_proof(cloud_key: &CloudKey, key_id: &str) -> [u8; 32] {
    let mut proof = [0u8; 32];
    Hkdf::<Sha256>::new(Some(key_id.as_bytes()), cloud_key)
        .expand(b"hakawati-key-proof-v1", &mut proof)
        .expect("32 bytes is a valid HKDF length");
    proof
}

pub fn key_check(cloud_key: &CloudKey, key_id: &str) -> String {
    STANDARD.encode(Sha256::digest(key_proof(cloud_key, key_id)))
}

pub fn canonical_json(fields: BTreeMap<&str, Value>) -> Vec<u8> {
    serde_json::to_vec(&fields).expect("JSON values serialize")
}

pub fn tale_aad(
    key_id: &str,
    account_id: &str,
    tale_id: &str,
    purpose: TalePurpose,
    content_rev: u64,
    metadata_rev: u64,
) -> Vec<u8> {
    canonical_json(BTreeMap::from([
        ("v", json!(1)),
        ("scheme", json!(SCHEME)),
        ("keyId", json!(key_id)),
        ("accountId", json!(account_id)),
        ("taleId", json!(tale_id)),
        ("purpose", json!(purpose.as_str())),
        ("contentRev", json!(content_rev)),
        ("metadataRev", json!(metadata_rev)),
    ]))
}

pub fn cover_aad(key_id: &str, account_id: &str, asset_id: &str) -> Vec<u8> {
    canonical_json(BTreeMap::from([
        ("v", json!(1)),
        ("scheme", json!(SCHEME)),
        ("keyId", json!(key_id)),
        ("accountId", json!(account_id)),
        ("assetId", json!(asset_id)),
        ("purpose", json!("cover")),
    ]))
}

pub fn recovery_aad(account_id: &str, key_id: &str) -> Vec<u8> {
    canonical_json(BTreeMap::from([
        ("v", json!(1)),
        ("accountId", json!(account_id)),
        ("keyId", json!(key_id)),
        ("purpose", json!("cloud-key.recovery")),
    ]))
}

pub struct Sealed {
    pub nonce: [u8; NONCE_BYTES],
    pub ciphertext: Vec<u8>,
    pub tag: [u8; TAG_BYTES],
}

pub fn seal(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Sealed {
    let nonce = random_bytes::<NONCE_BYTES>();
    let mut output = Aes256Gcm::new(key.into())
        .encrypt(
            &Nonce::from(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .expect("AES-GCM encryption of bounded input succeeds");
    let tag: [u8; TAG_BYTES] = output
        .split_off(output.len() - TAG_BYTES)
        .try_into()
        .expect("tag length");
    Sealed {
        nonce,
        ciphertext: output,
        tag,
    }
}

pub fn open(
    key: &[u8; 32],
    nonce: &[u8],
    ciphertext: &[u8],
    tag: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, String> {
    let nonce: [u8; NONCE_BYTES] = nonce.try_into().map_err(|_| "decrypt_failed")?;
    if tag.len() != TAG_BYTES {
        return Err("decrypt_failed".into());
    }
    let mut message = Vec::with_capacity(ciphertext.len() + TAG_BYTES);
    message.extend_from_slice(ciphertext);
    message.extend_from_slice(tag);
    Aes256Gcm::new(key.into())
        .decrypt(&Nonce::from(nonce), Payload { msg: &message, aad })
        .map_err(|_| "decrypt_failed".to_string())
}

pub fn seal_envelope(key: &[u8; 32], key_id: &str, plaintext: &[u8], aad: &[u8]) -> Envelope {
    let sealed = seal(key, plaintext, aad);
    Envelope {
        v: 1,
        scheme: SCHEME.into(),
        alg: ALG.into(),
        key_id: key_id.into(),
        nonce: STANDARD.encode(sealed.nonce),
        ciphertext: STANDARD.encode(sealed.ciphertext),
        tag: STANDARD.encode(sealed.tag),
    }
}

pub fn open_envelope(
    key: &[u8; 32],
    key_id: &str,
    envelope: &Envelope,
    aad: &[u8],
) -> Result<Vec<u8>, String> {
    if envelope.v != 1 || envelope.scheme != SCHEME || envelope.alg != ALG {
        return Err("envelope_unsupported".into());
    }
    if envelope.key_id != key_id {
        return Err("cloud_key_mismatch".into());
    }
    open(
        key,
        &decode_base64(&envelope.nonce)?,
        &decode_base64(&envelope.ciphertext)?,
        &decode_base64(&envelope.tag)?,
        aad,
    )
}

pub fn seal_cover(
    key: &CloudKey,
    key_id: &str,
    account_id: &str,
    asset_id: &str,
    image: &[u8],
) -> Vec<u8> {
    let sealed = seal(key, image, &cover_aad(key_id, account_id, asset_id));
    [sealed.nonce.as_slice(), &sealed.ciphertext, &sealed.tag].concat()
}

pub fn open_cover(
    key: &CloudKey,
    key_id: &str,
    account_id: &str,
    asset_id: &str,
    object: &[u8],
) -> Result<Vec<u8>, String> {
    if object.len() <= NONCE_BYTES + TAG_BYTES {
        return Err("decrypt_failed".into());
    }
    let (nonce, rest) = object.split_at(NONCE_BYTES);
    let (ciphertext, tag) = rest.split_at(rest.len() - TAG_BYTES);
    open(
        key,
        nonce,
        ciphertext,
        tag,
        &cover_aad(key_id, account_id, asset_id),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY_ID: &str = "8d5f0f7e-1c1a-4c47-9a0b-5f8c2f0b6c1e";

    fn fixed_key() -> CloudKey {
        std::array::from_fn(|index| index as u8)
    }

    #[test]
    fn key_proof_and_check_match_the_server() {
        // Computed with node:crypto hkdfSync and createHash, as the server does.
        let proof = key_proof(&fixed_key(), KEY_ID);
        assert_eq!(
            STANDARD.encode(proof),
            "EZeBIWq7i7oYO+BpCHrO4UbTDuwIOb4GKgcV+GjvLbQ="
        );
        assert_eq!(
            key_check(&fixed_key(), KEY_ID),
            "qzhaKFIgGVxOkTZNRc1CCqXk4JmUcZ1N/L2SEjdSb2k="
        );
        assert_ne!(
            key_check(&fixed_key(), "other"),
            key_check(&fixed_key(), KEY_ID)
        );
    }

    #[test]
    fn aad_is_sorted_compact_json() {
        assert_eq!(
            String::from_utf8(tale_aad(KEY_ID, "acct", "tale", TalePurpose::Summary, 2, 3))
                .unwrap(),
            format!(
                r#"{{"accountId":"acct","contentRev":2,"keyId":"{KEY_ID}","metadataRev":3,"purpose":"tale.summary","scheme":"client-v1","taleId":"tale","v":1}}"#
            )
        );
        assert_eq!(
            String::from_utf8(cover_aad(KEY_ID, "acct", "asset")).unwrap(),
            format!(
                r#"{{"accountId":"acct","assetId":"asset","keyId":"{KEY_ID}","purpose":"cover","scheme":"client-v1","v":1}}"#
            )
        );
        assert_eq!(
            String::from_utf8(recovery_aad("acct", KEY_ID)).unwrap(),
            format!(
                r#"{{"accountId":"acct","keyId":"{KEY_ID}","purpose":"cloud-key.recovery","v":1}}"#
            )
        );
    }

    #[test]
    fn envelopes_round_trip_and_bind_their_context() {
        let key = fixed_key();
        let aad = tale_aad(KEY_ID, "acct", "tale", TalePurpose::Package, 1, 1);
        let envelope = seal_envelope(&key, KEY_ID, b"{\"turns\":[]}", &aad);
        assert_eq!(envelope.v, 1);
        assert_eq!(envelope.scheme, "client-v1");
        assert_eq!(envelope.alg, "aes-256-gcm");
        assert_eq!(decode_base64(&envelope.nonce).unwrap().len(), 12);
        assert_eq!(decode_base64(&envelope.tag).unwrap().len(), 16);
        assert_eq!(
            decode_base64(&envelope.ciphertext).unwrap().len(),
            b"{\"turns\":[]}".len()
        );
        assert_eq!(
            open_envelope(&key, KEY_ID, &envelope, &aad).unwrap(),
            b"{\"turns\":[]}"
        );

        let wrong_purpose = tale_aad(KEY_ID, "acct", "tale", TalePurpose::Summary, 1, 1);
        let older = tale_aad(KEY_ID, "acct", "tale", TalePurpose::Package, 1, 2);
        let other_tale = tale_aad(KEY_ID, "acct", "other", TalePurpose::Package, 1, 1);
        for aad in [wrong_purpose, older, other_tale] {
            assert_eq!(
                open_envelope(&key, KEY_ID, &envelope, &aad),
                Err("decrypt_failed".into())
            );
        }
        assert_eq!(
            open_envelope(&key, "other-key", &envelope, &aad),
            Err("cloud_key_mismatch".into())
        );
        let mut tampered = envelope.clone();
        tampered.ciphertext = STANDARD.encode(b"{\"turns\":[1]}");
        assert!(open_envelope(&key, KEY_ID, &tampered, &aad).is_err());
        assert!(open_envelope(&random_bytes::<32>(), KEY_ID, &envelope, &aad).is_err());
    }

    #[test]
    fn covers_are_nonce_ciphertext_tag() {
        let key = fixed_key();
        let image = vec![0x89, b'P', b'N', b'G', 1, 2, 3];
        let object = seal_cover(&key, KEY_ID, "acct", "asset", &image);
        assert_eq!(object.len(), image.len() + 28);
        assert_eq!(
            open_cover(&key, KEY_ID, "acct", "asset", &object).unwrap(),
            image
        );
        assert!(open_cover(&key, KEY_ID, "acct", "other-asset", &object).is_err());
        assert!(open_cover(&key, KEY_ID, "other-acct", "asset", &object).is_err());
        assert!(open_cover(&key, KEY_ID, "acct", "asset", &object[..28]).is_err());
    }
}
