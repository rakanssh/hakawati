use serde::Serialize;
use std::{
    collections::HashMap,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const OAUTH_LOOPBACK_PORT: u16 = 47131;
const OAUTH_CANCELLED: &str = "Sign-in cancelled";

#[derive(Clone)]
struct OAuthLoopbackCanceller {
    sender: mpsc::Sender<()>,
    port: u16,
}

#[derive(Clone, Default)]
pub struct OAuthLoopbackState {
    listeners: Arc<Mutex<HashMap<String, mpsc::Receiver<Result<String, String>>>>>,
    cancellers: Arc<Mutex<HashMap<String, OAuthLoopbackCanceller>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthLoopbackStart {
    id: String,
    redirect_uri: String,
}

impl OAuthLoopbackState {
    fn start(&self, listener: TcpListener) -> Result<OAuthLoopbackStart, String> {
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let id = format!("oauth-{port}");
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");
        let (result_tx, result_rx) = mpsc::channel();
        let (cancel_tx, cancel_rx) = mpsc::channel();

        self.listeners
            .lock()
            .map_err(|_| "OAuth listener state is unavailable".to_string())?
            .insert(id.clone(), result_rx);
        self.cancellers
            .lock()
            .map_err(|_| "OAuth listener state is unavailable".to_string())?
            .insert(
                id.clone(),
                OAuthLoopbackCanceller {
                    sender: cancel_tx,
                    port,
                },
            );

        thread::spawn(move || {
            let result = read_callback(listener, port, cancel_rx);
            let _ = result_tx.send(result);
        });

        Ok(OAuthLoopbackStart { id, redirect_uri })
    }

    fn wait(&self, id: &str, timeout: Duration) -> Result<String, String> {
        let receiver = self
            .listeners
            .lock()
            .map_err(|_| "OAuth listener state is unavailable".to_string())?
            .remove(id)
            .ok_or_else(|| "OAuth listener not found".to_string())?;

        let result = match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = self.signal_cancel(id);
                Err("Timed out waiting for sign-in callback".to_string())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("Sign-in callback listener stopped unexpectedly".to_string())
            }
        };

        self.cancellers
            .lock()
            .map_err(|_| "OAuth listener state is unavailable".to_string())?
            .remove(id);
        result
    }

    fn signal_cancel(&self, id: &str) -> Result<(), String> {
        let canceller = self
            .cancellers
            .lock()
            .map_err(|_| "OAuth listener state is unavailable".to_string())?
            .get(id)
            .cloned();

        if let Some(canceller) = canceller {
            let _ = canceller.sender.send(());
            // Wake the nonblocking accept loop immediately instead of waiting for its poll interval.
            let _ = TcpStream::connect(("127.0.0.1", canceller.port));
        }
        Ok(())
    }
}

#[tauri::command]
pub fn start_oauth_loopback(
    state: tauri::State<'_, OAuthLoopbackState>,
) -> Result<OAuthLoopbackStart, String> {
    let listener =
        TcpListener::bind(("127.0.0.1", OAUTH_LOOPBACK_PORT)).map_err(|error| error.to_string())?;
    state.start(listener)
}

#[tauri::command]
pub async fn wait_oauth_loopback(
    state: tauri::State<'_, OAuthLoopbackState>,
    id: String,
    timeout_ms: u64,
) -> Result<String, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.wait(&id, Duration::from_millis(timeout_ms)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn cancel_oauth_loopback(
    state: tauri::State<'_, OAuthLoopbackState>,
    id: String,
) -> Result<(), String> {
    state.signal_cancel(&id)
}

fn read_callback(
    listener: TcpListener,
    port: u16,
    cancel_rx: mpsc::Receiver<()>,
) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(120);
    let (mut stream, _) = loop {
        if cancel_rx.try_recv().is_ok() {
            return Err(OAUTH_CANCELLED.to_string());
        }
        match listener.accept() {
            Ok(value) => {
                if cancel_rx.try_recv().is_ok() {
                    return Err(OAUTH_CANCELLED.to_string());
                }
                break value;
            }
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

#[cfg(test)]
mod tests {
    use super::{OAuthLoopbackState, OAUTH_CANCELLED};
    use std::{net::TcpListener, thread, time::Duration};

    #[test]
    fn cancellation_releases_a_waiting_login_and_its_port() {
        let state = OAuthLoopbackState::default();
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let started = state.start(listener).unwrap();
        let waiter_state = state.clone();
        let waiter_id = started.id.clone();
        let waiter = thread::spawn(move || waiter_state.wait(&waiter_id, Duration::from_secs(5)));

        thread::sleep(Duration::from_millis(20));
        state.signal_cancel(&started.id).unwrap();

        assert_eq!(waiter.join().unwrap().unwrap_err(), OAUTH_CANCELLED);
        TcpListener::bind(("127.0.0.1", port))
            .expect("cancelling login should release the callback port");
    }
}
