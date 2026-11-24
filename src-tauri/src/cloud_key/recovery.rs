use super::crypto::{self, CloudKey, Envelope};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SECRET_BYTES: usize = 16;
const BODY_CHARS: usize = 26;
const CHECK_CHARS: usize = 2;

pub type RecoverySecret = [u8; SECRET_BYTES];

pub fn generate() -> RecoverySecret {
    crypto::random_bytes::<SECRET_BYTES>()
}

fn checksum(secret: &RecoverySecret) -> u16 {
    let digest = Sha256::digest(secret);
    (u16::from(digest[0]) << 2) | u16::from(digest[1] >> 6)
}

pub fn format(secret: &RecoverySecret) -> String {
    let mut bits: u128 = u128::from_be_bytes(*secret);
    let mut body = [0u8; BODY_CHARS];
    // 130 bits: the secret followed by two zero bits.
    body[BODY_CHARS - 1] = ALPHABET[((bits & 0b111) << 2) as usize];
    bits >>= 3;
    for index in (0..BODY_CHARS - 1).rev() {
        body[index] = ALPHABET[(bits & 0b11111) as usize];
        bits >>= 5;
    }
    let check = checksum(secret);
    let characters: Vec<u8> = body
        .into_iter()
        .chain([
            ALPHABET[(check >> 5) as usize],
            ALPHABET[(check & 0b11111) as usize],
        ])
        .collect();
    characters
        .chunks(4)
        .map(|group| String::from_utf8_lossy(group).into_owned())
        .collect::<Vec<_>>()
        .join("-")
}

fn symbol(character: char) -> Option<u8> {
    let normalized = match character.to_ascii_uppercase() {
        'O' => '0',
        'I' | 'L' => '1',
        other => other,
    };
    ALPHABET
        .iter()
        .position(|candidate| char::from(*candidate) == normalized)
        .map(|position| position as u8)
}

pub fn parse(value: &str) -> Result<RecoverySecret, String> {
    let symbols: Vec<u8> = value
        .chars()
        .filter(|character| !character.is_whitespace() && *character != '-')
        .map(|character| symbol(character).ok_or_else(|| "recovery_key_invalid".to_string()))
        .collect::<Result<_, _>>()?;
    if symbols.len() != BODY_CHARS + CHECK_CHARS {
        return Err("recovery_key_invalid".into());
    }
    let mut bits: u128 = 0;
    for symbol in &symbols[..BODY_CHARS - 1] {
        bits = (bits << 5) | u128::from(*symbol);
    }
    let last = symbols[BODY_CHARS - 1];
    if last & 0b11 != 0 {
        return Err("recovery_key_invalid".into());
    }
    bits = (bits << 3) | u128::from(last >> 2);
    let secret = bits.to_be_bytes();
    let check = (u16::from(symbols[BODY_CHARS]) << 5) | u16::from(symbols[BODY_CHARS + 1]);
    if check != checksum(&secret) {
        return Err("recovery_key_invalid".into());
    }
    Ok(secret)
}

fn wrap_key(secret: &RecoverySecret, account_id: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(Some(account_id.as_bytes()), secret)
        .expand(b"hakawati-recovery-v1", &mut key)
        .expect("32 bytes is a valid HKDF length");
    key
}

pub fn wrap(
    secret: &RecoverySecret,
    account_id: &str,
    key_id: &str,
    cloud_key: &CloudKey,
) -> Envelope {
    crypto::seal_envelope(
        &wrap_key(secret, account_id),
        key_id,
        cloud_key,
        &crypto::recovery_aad(account_id, key_id),
    )
}

pub fn unwrap(
    secret: &RecoverySecret,
    account_id: &str,
    key_id: &str,
    envelope: &Envelope,
) -> Result<CloudKey, String> {
    crypto::open_envelope(
        &wrap_key(secret, account_id),
        key_id,
        envelope,
        &crypto::recovery_aad(account_id, key_id),
    )
    .map_err(|_| "recovery_key_mismatch".to_string())?
    .try_into()
    .map_err(|_| "recovery_key_mismatch".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_seven_groups_of_four_crockford_characters() {
        let secret = [0u8; 16];
        let formatted = format(&secret);
        assert_eq!(formatted.len(), 28 + 6);
        let groups: Vec<_> = formatted.split('-').collect();
        assert_eq!(groups.len(), 7);
        assert!(groups.iter().all(|group| group.len() == 4));
        assert!(formatted.starts_with("0000-0000-0000-0000-0000-0000-00"));
        for _ in 0..200 {
            let secret = generate();
            let formatted = format(&secret);
            assert!(formatted
                .chars()
                .all(|character| character == '-' || ALPHABET.contains(&(character as u8))));
            assert_eq!(parse(&formatted).unwrap(), secret);
        }
    }

    #[test]
    fn parsing_is_forgiving_about_case_spacing_and_lookalikes() {
        let secret: RecoverySecret = std::array::from_fn(|index| (index * 17) as u8);
        let formatted = format(&secret);
        let relaxed = formatted
            .to_lowercase()
            .replace('-', " ")
            .replace('0', "o")
            .replace('1', "l");
        assert_eq!(parse(&relaxed).unwrap(), secret);
        assert_eq!(parse(&formatted.replace('-', "")).unwrap(), secret);
    }

    #[test]
    fn rejects_typos_and_wrong_lengths() {
        let secret: RecoverySecret = std::array::from_fn(|index| (index * 31 + 7) as u8);
        let formatted = format(&secret).replace('-', "");
        let mut typo: Vec<char> = formatted.chars().collect();
        typo[5] = if typo[5] == 'A' { 'B' } else { 'A' };
        let typo: String = typo.into_iter().collect();
        assert_eq!(parse(&typo), Err("recovery_key_invalid".into()));
        assert!(parse(&formatted[..27]).is_err());
        assert!(parse(&format!("{formatted}0")).is_err());
        assert!(parse("UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU").is_err());
    }

    #[test]
    fn wraps_the_cloud_key_for_one_account_and_key() {
        let secret = generate();
        let cloud_key = crypto::random_bytes::<32>();
        let envelope = wrap(&secret, "acct", "key-1", &cloud_key);
        assert_eq!(envelope.key_id, "key-1");
        assert_eq!(
            unwrap(&secret, "acct", "key-1", &envelope).unwrap(),
            cloud_key
        );
        assert_eq!(
            unwrap(&generate(), "acct", "key-1", &envelope),
            Err("recovery_key_mismatch".into())
        );
        assert!(unwrap(&secret, "other-acct", "key-1", &envelope).is_err());
        assert!(unwrap(&secret, "acct", "key-2", &envelope).is_err());
    }
}
