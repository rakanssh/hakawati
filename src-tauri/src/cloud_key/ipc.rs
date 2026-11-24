use super::CloudKeyState;
use serde_json::{json, Value};
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
    App, WebviewWindow, WebviewWindowBuilder,
};

const LOCAL_ORIGIN: &str = if cfg!(any(windows, target_os = "android")) {
    "http://tauri.localhost"
} else {
    "tauri://localhost"
};

struct Device {
    _app: App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
    scope: Value,
}

impl Device {
    fn new(server_origin: &str, account_id: &str) -> Self {
        let app = mock_builder()
            .manage(CloudKeyState::default())
            .invoke_handler(tauri::generate_handler![
                super::cloud_key_local,
                super::cloud_key_begin_setup,
                super::cloud_key_adopt,
                super::cloud_key_discard_pending,
                super::cloud_key_forget,
                super::cloud_key_proof,
                super::cloud_key_new_recovery,
                super::cloud_key_recover,
                super::cloud_tale_encrypt,
                super::cloud_tale_decrypt,
                super::cloud_summaries_decrypt,
                super::cloud_cover_encrypt,
                super::cloud_cover_decrypt,
                super::cloud_pairing_show,
                super::cloud_pairing_scan,
                super::cloud_pairing_confirm,
                super::cloud_pairing_seal,
                super::cloud_pairing_open,
                super::cloud_pairing_end,
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Self {
            _app: app,
            webview,
            scope: json!({ "serverOrigin": server_origin, "accountId": account_id }),
        }
    }

    fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: LOCAL_ORIGIN.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    fn call(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args)
            .unwrap_or_else(|error| panic!("{cmd} failed: {error}"))
    }

    fn set_up(&self) -> Value {
        let setup = self.call("cloud_key_begin_setup", json!({ "scope": self.scope }));
        assert_eq!(
            self.call(
                "cloud_key_adopt",
                json!({
                    "scope": self.scope,
                    "keyId": setup["keyId"],
                    "keyCheck": setup["keyCheck"],
                }),
            ),
            json!(true)
        );
        setup
    }
}

fn account() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[test]
fn commands_accept_the_arguments_the_app_sends() {
    let account_id = account();
    let phone = Device::new("https://sync.example", &account_id);
    assert_eq!(
        phone.call("cloud_key_local", json!({ "scope": phone.scope })),
        json!({ "keyId": null, "hasKey": false, "pendingKeyId": null })
    );
    let setup = phone.set_up();
    let key_id = setup["keyId"].clone();
    assert_eq!(
        phone.call("cloud_key_local", json!({ "scope": phone.scope })),
        json!({ "keyId": key_id, "hasKey": true, "pendingKeyId": null })
    );

    let revision = json!({ "taleId": "tale-1", "contentRev": 2, "metadataRev": 3 });
    let sealed = phone.call(
        "cloud_tale_encrypt",
        json!({
            "scope": phone.scope,
            "keyId": key_id,
            "revision": revision,
            "summary": "{\"title\":\"Gate\"}",
            "package": "{\"turns\":[]}",
        }),
    );
    assert_eq!(sealed["package"]["scheme"], "client-v1");
    assert_eq!(sealed["package"]["keyId"], key_id);
    assert_eq!(
        phone.call(
            "cloud_tale_decrypt",
            json!({
                "scope": phone.scope,
                "keyId": key_id,
                "revision": revision,
                "summary": sealed["summary"],
                "package": sealed["package"],
            }),
        ),
        json!({ "summary": "{\"title\":\"Gate\"}", "package": "{\"turns\":[]}" })
    );
    assert_eq!(
        phone.call(
            "cloud_summaries_decrypt",
            json!({
                "scope": phone.scope,
                "keyId": key_id,
                "items": [
                    { "taleId": "tale-1", "contentRev": 2, "metadataRev": 3, "summary": sealed["summary"] },
                    { "taleId": "tale-1", "contentRev": 1, "metadataRev": 3, "summary": sealed["summary"] },
                ],
            }),
        ),
        json!(["{\"title\":\"Gate\"}", null])
    );
    let asset_id = uuid::Uuid::new_v4().to_string();
    let cover = phone.call(
        "cloud_cover_encrypt",
        json!({
            "scope": phone.scope,
            "keyId": key_id,
            "assetId": asset_id,
            "imageBase64": "iVBORw0K",
        }),
    );
    assert_eq!(
        super::crypto::decode_base64(cover.as_str().unwrap())
            .unwrap()
            .len(),
        6 + 28
    );
    assert_eq!(
        phone.invoke(
            "cloud_cover_decrypt",
            json!({
                "scope": phone.scope,
                "keyId": key_id,
                "assetId": uuid::Uuid::new_v4().to_string(),
                "objectBase64": cover,
            }),
        ),
        Err(json!("decrypt_failed"))
    );
    let proof = phone.call(
        "cloud_key_proof",
        json!({ "scope": phone.scope, "keyId": key_id }),
    );
    assert_eq!(proof.as_str().unwrap().len(), 44);

    let replacement = phone.call(
        "cloud_key_new_recovery",
        json!({ "scope": phone.scope, "keyId": key_id }),
    );
    assert_eq!(replacement["keyProof"], proof);
    let desktop = Device::new("https://other-device.example", &account_id);
    assert_eq!(
        desktop.invoke(
            "cloud_key_recover",
            json!({
                "scope": desktop.scope,
                "keyId": key_id,
                "keyCheck": setup["keyCheck"],
                "recoveryWrappedKey": setup["recoveryWrappedKey"],
                "recoveryKey": replacement["recoveryKey"],
            }),
        ),
        Err(json!("recovery_key_mismatch"))
    );
    desktop.call(
        "cloud_key_recover",
        json!({
            "scope": desktop.scope,
            "keyId": key_id,
            "keyCheck": setup["keyCheck"],
            "recoveryWrappedKey": replacement["recoveryWrappedKey"],
            "recoveryKey": replacement["recoveryKey"],
        }),
    );
    assert_eq!(
        desktop.call(
            "cloud_key_proof",
            json!({ "scope": desktop.scope, "keyId": key_id })
        ),
        proof
    );
    assert_eq!(
        desktop.call(
            "cloud_cover_decrypt",
            json!({
                "scope": desktop.scope,
                "keyId": key_id,
                "assetId": asset_id,
                "objectBase64": cover,
            }),
        ),
        json!("iVBORw0K")
    );

    phone.call("cloud_key_forget", json!({ "scope": phone.scope }));
    assert_eq!(
        phone.invoke(
            "cloud_key_proof",
            json!({ "scope": phone.scope, "keyId": key_id })
        ),
        Err(json!("cloud_key_missing"))
    );
}

fn pair(direction: &str) {
    let account_id = account();
    let unlocked = Device::new("https://unlocked.example", &account_id);
    let locked = Device::new("https://locked.example", &account_id);
    let setup = unlocked.set_up();
    let key_id = setup["keyId"].clone();
    let pairing_id = uuid::Uuid::new_v4().to_string();
    let (shower, scanner) = if direction == "send" {
        (&unlocked, &locked)
    } else {
        (&locked, &unlocked)
    };

    let qr = shower.call(
        "cloud_pairing_show",
        json!({ "scope": shower.scope, "pairingId": pairing_id, "direction": direction }),
    );
    assert_eq!(qr.as_str().unwrap().len(), 116);
    let scanned = scanner.call(
        "cloud_pairing_scan",
        json!({ "scope": scanner.scope, "code": qr }),
    );
    assert_eq!(scanned["pairingId"], json!(pairing_id));
    assert_eq!(scanned["direction"], json!(direction));
    let code = shower.call(
        "cloud_pairing_confirm",
        json!({
            "pairingId": pairing_id,
            "scannerPublicKey": scanned["scannerPublicKey"],
            "scannerConfirm": scanned["scannerConfirm"],
        }),
    );
    assert_eq!(code, scanned["code"]);

    let sender = if direction == "send" { shower } else { scanner };
    let receiver = if direction == "send" { scanner } else { shower };
    assert_eq!(
        receiver.invoke(
            "cloud_pairing_seal",
            json!({ "pairingId": pairing_id, "keyId": key_id }),
        ),
        Err(json!("pairing_state_invalid"))
    );
    let payload = sender.call(
        "cloud_pairing_seal",
        json!({ "pairingId": pairing_id, "keyId": key_id }),
    );
    assert_eq!(
        receiver.invoke(
            "cloud_pairing_open",
            json!({
                "pairingId": pairing_id,
                "keyId": key_id,
                "keyCheck": "qzhaKFIgGVxOkTZNRc1CCqXk4JmUcZ1N/L2SEjdSb2k=",
                "payload": payload,
            }),
        ),
        Err(json!("cloud_key_check_failed"))
    );
    receiver.call(
        "cloud_pairing_open",
        json!({
            "pairingId": pairing_id,
            "keyId": key_id,
            "keyCheck": setup["keyCheck"],
            "payload": payload,
        }),
    );
    for device in [shower, scanner] {
        device.call("cloud_pairing_end", json!({ "pairingId": pairing_id }));
    }

    assert_eq!(
        locked.call("cloud_key_local", json!({ "scope": locked.scope })),
        json!({ "keyId": key_id, "hasKey": true, "pendingKeyId": null })
    );
    assert_eq!(
        locked.call(
            "cloud_key_proof",
            json!({ "scope": locked.scope, "keyId": key_id })
        ),
        unlocked.call(
            "cloud_key_proof",
            json!({ "scope": unlocked.scope, "keyId": key_id })
        )
    );
}

#[test]
fn a_device_showing_a_send_code_unlocks_the_scanner() {
    pair("send");
}

#[test]
fn a_device_scanning_a_receive_code_unlocks_the_shower() {
    pair("receive");
}

#[test]
fn a_scanner_on_another_account_cannot_confirm() {
    let unlocked = Device::new("https://unlocked.example", &account());
    let other = Device::new("https://other.example", &account());
    let pairing_id = uuid::Uuid::new_v4().to_string();
    let qr = unlocked.call(
        "cloud_pairing_show",
        json!({ "scope": unlocked.scope, "pairingId": pairing_id, "direction": "send" }),
    );
    let scanned = other.call(
        "cloud_pairing_scan",
        json!({ "scope": other.scope, "code": qr }),
    );
    assert_eq!(
        unlocked.invoke(
            "cloud_pairing_confirm",
            json!({
                "pairingId": pairing_id,
                "scannerPublicKey": scanned["scannerPublicKey"],
                "scannerConfirm": scanned["scannerConfirm"],
            }),
        ),
        Err(json!("pairing_confirm_failed"))
    );
}
