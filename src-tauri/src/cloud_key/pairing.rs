use super::crypto::{self, CloudKey};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

const QR_PREFIX: &str = "HKWP1:";
const QR_VERSION: u8 = 1;
const QR_BYTES: usize = 1 + 1 + 16 + 32 + 32;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Send,
    Receive,
}

impl Direction {
    fn byte(self) -> u8 {
        match self {
            Self::Send => 1,
            Self::Receive => 2,
        }
    }

    fn from_byte(value: u8) -> Option<Self> {
        match value {
            1 => Some(Self::Send),
            2 => Some(Self::Receive),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Payload {
    pub v: u8,
    pub nonce: String,
    pub ciphertext: String,
    pub tag: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PayloadContent {
    v: u8,
    key_id: String,
    cloud_key: String,
}

#[derive(Debug, PartialEq)]
pub struct QrCode {
    pub direction: Direction,
    pub pairing_id: [u8; 16],
    pub shower_public: [u8; 32],
    pub secret: [u8; 32],
}

impl QrCode {
    pub fn encode(&self) -> String {
        let mut bytes = Vec::with_capacity(QR_BYTES);
        bytes.push(QR_VERSION);
        bytes.push(self.direction.byte());
        bytes.extend_from_slice(&self.pairing_id);
        bytes.extend_from_slice(&self.shower_public);
        bytes.extend_from_slice(&self.secret);
        format!("{QR_PREFIX}{}", URL_SAFE_NO_PAD.encode(bytes))
    }

    pub fn decode(value: &str) -> Result<Self, String> {
        let invalid = || "pairing_code_invalid".to_string();
        let encoded = value.trim().strip_prefix(QR_PREFIX).ok_or_else(invalid)?;
        let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| invalid())?;
        if bytes.len() != QR_BYTES || bytes[0] != QR_VERSION {
            return Err(invalid());
        }
        Ok(Self {
            direction: Direction::from_byte(bytes[1]).ok_or_else(invalid)?,
            pairing_id: bytes[2..18].try_into().map_err(|_| invalid())?,
            shower_public: bytes[18..50].try_into().map_err(|_| invalid())?,
            secret: bytes[50..82].try_into().map_err(|_| invalid())?,
        })
    }
}

pub struct Keys {
    th: [u8; 32],
    payload: [u8; 32],
    confirm: [u8; 32],
    pub code: String,
}

pub struct Transcript<'a> {
    pub account_id: &'a str,
    pub pairing_id: &'a [u8; 16],
    pub direction: Direction,
    pub shower_public: &'a [u8; 32],
    pub scanner_public: &'a [u8; 32],
    pub secret: &'a [u8; 32],
}

pub fn derive(
    own: &StaticSecret,
    peer: &[u8; 32],
    transcript: &Transcript,
) -> Result<Keys, String> {
    let shared = own.diffie_hellman(&PublicKey::from(*peer));
    if !shared.was_contributory() {
        return Err("pairing_key_invalid".into());
    }
    let th: [u8; 32] = Sha256::new()
        .chain_update(b"hakawati-pair-v1")
        .chain_update(transcript.account_id.as_bytes())
        .chain_update(transcript.pairing_id)
        .chain_update([transcript.direction.byte()])
        .chain_update(transcript.shower_public)
        .chain_update(transcript.scanner_public)
        .finalize()
        .into();
    let ikm = [shared.as_bytes().as_slice(), transcript.secret].concat();
    let hkdf = Hkdf::<Sha256>::new(Some(transcript.pairing_id), &ikm);
    let expand = |label: &[u8], output: &mut [u8]| {
        hkdf.expand(&[label, &th].concat(), output)
            .expect("valid HKDF length");
    };
    let mut payload = [0u8; 32];
    let mut confirm = [0u8; 32];
    let mut code = [0u8; 4];
    expand(b"payload", &mut payload);
    expand(b"confirm", &mut confirm);
    expand(b"code", &mut code);
    Ok(Keys {
        th,
        payload,
        confirm,
        code: format!("{:06}", u32::from_be_bytes(code) % 1_000_000),
    })
}

type HmacSha256 = Hmac<Sha256>;

impl Keys {
    fn confirm_mac(&self) -> HmacSha256 {
        let mut mac = HmacSha256::new_from_slice(&self.confirm).expect("HMAC takes any key length");
        mac.update(b"scanner");
        mac.update(&self.th);
        mac
    }

    pub fn scanner_confirm(&self) -> String {
        STANDARD.encode(self.confirm_mac().finalize().into_bytes())
    }

    pub fn verify_scanner_confirm(&self, value: &str) -> Result<(), String> {
        let expected = crypto::decode_base64(value)?;
        self.confirm_mac()
            .verify_slice(&expected)
            .map_err(|_| "pairing_confirm_failed".to_string())
    }

    pub fn seal(&self, key_id: &str, cloud_key: &CloudKey) -> Payload {
        let content = serde_json::to_vec(&PayloadContent {
            v: 1,
            key_id: key_id.into(),
            cloud_key: STANDARD.encode(cloud_key),
        })
        .expect("payload serializes");
        let sealed = crypto::seal(&self.payload, &content, &self.th);
        Payload {
            v: 1,
            nonce: STANDARD.encode(sealed.nonce),
            ciphertext: STANDARD.encode(sealed.ciphertext),
            tag: STANDARD.encode(sealed.tag),
        }
    }

    pub fn open(&self, payload: &Payload) -> Result<(String, CloudKey), String> {
        if payload.v != 1 {
            return Err("pairing_payload_invalid".into());
        }
        let content = crypto::open(
            &self.payload,
            &crypto::decode_base64(&payload.nonce)?,
            &crypto::decode_base64(&payload.ciphertext)?,
            &crypto::decode_base64(&payload.tag)?,
            &self.th,
        )
        .map_err(|_| "pairing_payload_invalid".to_string())?;
        let content: PayloadContent =
            serde_json::from_slice(&content).map_err(|_| "pairing_payload_invalid".to_string())?;
        if content.v != 1 {
            return Err("pairing_payload_invalid".into());
        }
        Ok((content.key_id, crypto::decode_key(&content.cloud_key)?))
    }
}

pub fn generate_secret() -> StaticSecret {
    StaticSecret::from(crypto::random_bytes::<32>())
}

pub fn public_key(secret: &StaticSecret) -> [u8; 32] {
    PublicKey::from(secret).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Pair {
        shower: Keys,
        scanner: Keys,
    }

    fn pair(direction: Direction, scanner_account: &str) -> (QrCode, Pair) {
        let pairing_id = *uuid::Uuid::new_v4().as_bytes();
        let shower_secret = generate_secret();
        let qr = QrCode {
            direction,
            pairing_id,
            shower_public: public_key(&shower_secret),
            secret: crypto::random_bytes::<32>(),
        };
        let scanned = QrCode::decode(&qr.encode()).unwrap();
        let scanner_secret = generate_secret();
        let scanner_public = public_key(&scanner_secret);
        let scanner = derive(
            &scanner_secret,
            &scanned.shower_public,
            &Transcript {
                account_id: scanner_account,
                pairing_id: &scanned.pairing_id,
                direction: scanned.direction,
                shower_public: &scanned.shower_public,
                scanner_public: &scanner_public,
                secret: &scanned.secret,
            },
        )
        .unwrap();
        let shower = derive(
            &shower_secret,
            &scanner_public,
            &Transcript {
                account_id: "acct",
                pairing_id: &qr.pairing_id,
                direction: qr.direction,
                shower_public: &qr.shower_public,
                scanner_public: &scanner_public,
                secret: &qr.secret,
            },
        )
        .unwrap();
        (qr, Pair { shower, scanner })
    }

    #[test]
    fn qr_payload_is_116_characters_and_round_trips() {
        let (qr, _) = pair(Direction::Send, "acct");
        let encoded = qr.encode();
        assert_eq!(encoded.len(), 116);
        assert!(encoded.starts_with("HKWP1:"));
        assert!(!encoded.contains('=') && !encoded.contains('+') && !encoded.contains('/'));
        assert_eq!(QrCode::decode(&encoded).unwrap(), qr);
        assert!(QrCode::decode("HKWP1:abc").is_err());
        assert!(QrCode::decode(&encoded.replace("HKWP1:", "HKWP2:")).is_err());
    }

    #[test]
    fn both_sides_agree_on_the_code_and_the_payload_key() {
        for direction in [Direction::Send, Direction::Receive] {
            let (_, pair) = pair(direction, "acct");
            assert_eq!(pair.shower.code.len(), 6);
            assert_eq!(pair.shower.code, pair.scanner.code);
            pair.shower
                .verify_scanner_confirm(&pair.scanner.scanner_confirm())
                .unwrap();
            let cloud_key = crypto::random_bytes::<32>();
            let payload = pair.shower.seal("key-1", &cloud_key);
            assert_eq!(
                pair.scanner.open(&payload).unwrap(),
                ("key-1".into(), cloud_key)
            );
            let payload = pair.scanner.seal("key-1", &cloud_key);
            assert_eq!(pair.shower.open(&payload).unwrap().1, cloud_key);
        }
    }

    #[test]
    fn a_substituted_scanner_key_fails_confirmation() {
        let (qr, pair) = pair(Direction::Send, "acct");
        let attacker_secret = generate_secret();
        let attacker_public = public_key(&attacker_secret);
        let guessed_secret = crypto::random_bytes::<32>();
        let attacker = derive(
            &attacker_secret,
            &qr.shower_public,
            &Transcript {
                account_id: "acct",
                pairing_id: &qr.pairing_id,
                direction: qr.direction,
                shower_public: &qr.shower_public,
                scanner_public: &attacker_public,
                secret: &guessed_secret,
            },
        )
        .unwrap();
        assert_eq!(
            pair.shower
                .verify_scanner_confirm(&attacker.scanner_confirm()),
            Err("pairing_confirm_failed".into())
        );
        let payload = attacker.seal("key-1", &crypto::random_bytes::<32>());
        assert!(pair.shower.open(&payload).is_err());
    }

    #[test]
    fn transcripts_bind_the_account() {
        let (_, pair) = pair(Direction::Receive, "other-acct");
        assert!(pair
            .shower
            .verify_scanner_confirm(&pair.scanner.scanner_confirm())
            .is_err());
    }

    #[test]
    fn rejects_low_order_peer_keys() {
        let transcript = Transcript {
            account_id: "acct",
            pairing_id: &[0; 16],
            direction: Direction::Send,
            shower_public: &[0; 32],
            scanner_public: &[0; 32],
            secret: &[0; 32],
        };
        assert!(derive(&generate_secret(), &[0; 32], &transcript).is_err());
    }
}
