//! Opens the page of a loopback sign-in (cloud sync and ChatGPT). Phones suspend or
//! freeze apps that are not in front, which stops the loopback listener while the
//! browser is open, so on mobile the page opens over Hakawati instead and closes once
//! the callback arrives: in a sign-in sheet on iOS (SignInSheetPlugin.swift in the
//! ios/Plugins Swift package) and in a web view on Android (SignInSheetPlugin.kt).
//! On desktop it opens in the system browser.
use crate::oauth_loopback::OAuthLoopbackState;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Wry};

/// Registers the sign-in sheet on mobile.
pub fn init() -> TauriPlugin<Wry> {
    Builder::new("sign-in-sheet")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                _app.manage(ios::register(_api)?);
            }
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                _app.manage(android::register(_api)?);
            }
            Ok(())
        })
        .build()
}

/// Opens `url` for the sign-in waiting on loopback listener `listener_id`. Closing
/// the sign-in sheet cancels that sign-in.
pub async fn open(
    app: &AppHandle,
    url: &str,
    loopback: &OAuthLoopbackState,
    listener_id: &str,
) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    return ios::open(app, url, loopback, listener_id).await;

    #[cfg(target_os = "android")]
    return android::open(app, url, loopback, listener_id).await;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        use tauri_plugin_opener::OpenerExt;
        let _ = (loopback, listener_id);
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|_| "Cannot open the system browser for sign-in".to_string())
    }
}

/// Closes the sign-in sheet once its sign-in has ended. A system browser stays open.
pub async fn close(app: &AppHandle) {
    #[cfg(target_os = "ios")]
    ios::close(app).await;

    #[cfg(target_os = "android")]
    android::close(app).await;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let _ = app;
}

#[cfg(target_os = "android")]
mod android {
    use crate::oauth_loopback::OAuthLoopbackState;
    use serde::{Deserialize, Serialize};
    use tauri::ipc::{Channel, InvokeResponseBody};
    use tauri::plugin::{mobile::PluginInvokeError, PluginApi, PluginHandle};
    use tauri::{AppHandle, Manager, Wry};

    pub struct SignInSheet(PluginHandle<Wry>);

    pub fn register(api: PluginApi<Wry, ()>) -> Result<SignInSheet, PluginInvokeError> {
        Ok(SignInSheet(api.register_android_plugin(
            "dev.hakawati.app",
            "SignInSheetPlugin",
        )?))
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenArgs {
        url: String,
        on_event: Channel<serde_json::Value>,
    }

    #[derive(Deserialize)]
    #[serde(tag = "type", rename_all = "camelCase")]
    enum SheetEvent {
        Callback { url: String },
        Dismissed,
    }

    pub async fn open(
        app: &AppHandle,
        url: &str,
        loopback: &OAuthLoopbackState,
        listener_id: &str,
    ) -> Result<(), String> {
        let loopback = loopback.clone();
        let listener_id = listener_id.to_string();
        let on_event = Channel::new(move |body: InvokeResponseBody| {
            let loopback = loopback.clone();
            let listener_id = listener_id.clone();
            // The callback reaches the listener over its own socket, off the IPC thread.
            std::thread::spawn(move || match body.deserialize::<SheetEvent>() {
                Ok(SheetEvent::Callback { url }) => {
                    if loopback.deliver(&listener_id, &url).is_err() {
                        let _ = loopback.signal_cancel(&listener_id);
                    }
                }
                _ => {
                    let _ = loopback.signal_cancel(&listener_id);
                }
            });
            Ok(())
        });
        let args = OpenArgs {
            url: url.to_string(),
            on_event,
        };
        app.state::<SignInSheet>()
            .0
            .run_mobile_plugin_async::<()>("open", args)
            .await
            .map_err(|_| "Cannot open the sign-in page".to_string())
    }

    pub async fn close(app: &AppHandle) {
        let _ = app
            .state::<SignInSheet>()
            .0
            .run_mobile_plugin_async::<()>("close", ())
            .await;
    }
}

#[cfg(target_os = "ios")]
mod ios {
    use crate::oauth_loopback::OAuthLoopbackState;
    use serde::Serialize;
    use tauri::ipc::Channel;
    use tauri::plugin::{mobile::PluginInvokeError, PluginApi, PluginHandle};
    use tauri::{AppHandle, Manager, Wry};

    tauri::ios_plugin_binding!(init_plugin_sign_in_sheet);

    pub struct SignInSheet(PluginHandle<Wry>);

    pub fn register(api: PluginApi<Wry, ()>) -> Result<SignInSheet, PluginInvokeError> {
        Ok(SignInSheet(
            api.register_ios_plugin(init_plugin_sign_in_sheet)?,
        ))
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenArgs {
        url: String,
        on_dismissed: Channel<serde_json::Value>,
    }

    pub async fn open(
        app: &AppHandle,
        url: &str,
        loopback: &OAuthLoopbackState,
        listener_id: &str,
    ) -> Result<(), String> {
        let loopback = loopback.clone();
        let listener_id = listener_id.to_string();
        let on_dismissed = Channel::new(move |_| {
            let _ = loopback.signal_cancel(&listener_id);
            Ok(())
        });
        let args = OpenArgs {
            url: url.to_string(),
            on_dismissed,
        };
        app.state::<SignInSheet>()
            .0
            .run_mobile_plugin_async::<()>("open", args)
            .await
            .map_err(|_| "Cannot open the sign-in page".to_string())
    }

    pub async fn close(app: &AppHandle) {
        let _ = app
            .state::<SignInSheet>()
            .0
            .run_mobile_plugin_async::<()>("close", ())
            .await;
    }
}
