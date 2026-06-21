use serde::Serialize;
use std::{
    collections::HashMap,
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};

// ponytail: fixed callback port for OIDC providers that require exact redirect URIs.
const OAUTH_LOOPBACK_PORT: u16 = 47131;

#[derive(Default)]
pub struct OAuthLoopbackState {
    listeners: Mutex<HashMap<String, mpsc::Receiver<Result<String, String>>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthLoopbackStart {
    id: String,
    redirect_uri: String,
}

#[tauri::command]
pub fn start_oauth_loopback(
    state: tauri::State<'_, OAuthLoopbackState>,
) -> Result<OAuthLoopbackStart, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_LOOPBACK_PORT))
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let id = format!("oauth-{port}");
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let (tx, rx) = mpsc::channel();

    state
        .listeners
        .lock()
        .map_err(|_| "OAuth listener state is unavailable".to_string())?
        .insert(id.clone(), rx);

    std::thread::spawn(move || {
        let result = read_callback(listener, port);
        let _ = tx.send(result);
    });

    Ok(OAuthLoopbackStart { id, redirect_uri })
}

#[tauri::command]
pub fn wait_oauth_loopback(
    state: tauri::State<'_, OAuthLoopbackState>,
    id: String,
    timeout_ms: u64,
) -> Result<String, String> {
    let rx = state
        .listeners
        .lock()
        .map_err(|_| "OAuth listener state is unavailable".to_string())?
        .remove(&id)
        .ok_or_else(|| "OAuth listener not found".to_string())?;

    rx.recv_timeout(Duration::from_millis(timeout_ms))
        .map_err(|_| "Timed out waiting for sign-in callback".to_string())?
}

fn read_callback(listener: TcpListener, port: u16) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(120);
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(value) => break value,
            Err(error) if error.kind() == ErrorKind::WouldBlock && Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                return Err("Timed out waiting for sign-in callback".to_string());
            }
            Err(error) => return Err(error.to_string()),
        }
    };
    let mut buffer = [0_u8; 4096];
    let read = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "Invalid OAuth callback request".to_string())?;
    let callback_url = format!("http://127.0.0.1:{port}{path}");
    let response = concat!(
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: text/html; charset=utf-8\r\n",
        "Connection: close\r\n",
        "\r\n",
        "<!doctype html><title>Hakawati</title>",
        "<p>Sign-in complete. You can return to Hakawati.</p>"
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(callback_url)
}
