//! ChatGPT subscription authentication and transport are isolated from game state.
//! OAuth credentials never cross the native/webview boundary.
mod vault;

use aes_gcm::{
    aead::{KeyInit, OsRng},
    Aes256Gcm,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    net::TcpListener,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio_util::sync::CancellationToken;
use vault::{Connection, LockedVault, Tokens, Vault};

const ISSUER: &str = "https://auth.openai.com";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE: &str = "https://api.openai.com/v1";
const DIRECT_SCOPE: &str = "chatgpt.tokens.use.direct";
const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const CANCELLED: &str = "ChatGPT request cancelled";

#[derive(Default)]
pub struct ChatGptState {
    operations: Mutex<HashMap<String, CancellationToken>>,
    sign_in: tokio::sync::Mutex<()>,
    loopback: crate::oauth_loopback::OAuthLoopbackState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    available: bool,
    connected: bool,
    plan_usage_enabled: bool,
    account: Option<PublicAccount>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicAccount {
    id: String,
    email: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignOutResult {
    remote_revocation_confirmed: bool,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HttpEvent {
    Headers {
        status: u16,
        headers: HashMap<String, String>,
    },
    Chunk {
        data: Vec<u8>,
    },
    End,
}

fn available() -> bool {
    !cfg!(any(target_os = "android", target_os = "ios"))
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random_secret() -> String {
    URL_SAFE_NO_PAD.encode(Aes256Gcm::generate_key(&mut OsRng))
}
fn has_scope(scope: &str) -> bool {
    scope.split_whitespace().any(|part| part == DIRECT_SCOPE)
}
fn connected(connection: &Connection) -> bool {
    connection.tokens.as_ref().is_some_and(|tokens| {
        !tokens.access_token.is_empty()
            && (tokens.expires_at > now() || tokens.refresh_token.is_some())
    })
}

fn public_session(data: &Vault) -> Session {
    let connection = data.connection.as_ref();
    let connected = connection.is_some_and(connected);
    Session {
        available: available(),
        connected,
        plan_usage_enabled: connected
            && connection
                .and_then(|connection| connection.tokens.as_ref())
                .is_some_and(|tokens| has_scope(&tokens.scope)),
        account: connection
            .filter(|connection| connection.subject.is_some() && connection.tokens.is_some())
            .map(|connection| PublicAccount {
                id: connection.id.clone(),
                email: connection.email.clone(),
            }),
    }
}

fn vault_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Cannot locate ChatGPT credentials")?
        .join(if cfg!(debug_assertions) {
            "chatgpt-dev"
        } else {
            "chatgpt"
        }))
}

async fn open_vault(app: &AppHandle) -> Result<LockedVault, String> {
    if !available() {
        return Err("ChatGPT sign-in is available in the desktop app".into());
    }
    let root = vault_root(app)?;
    tauri::async_runtime::spawn_blocking(move || LockedVault::open(root))
        .await
        .map_err(|_| "Cannot open ChatGPT credentials".to_string())?
}

fn client() -> Result<Client, String> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Cannot initialize ChatGPT connection".into())
}

impl ChatGptState {
    fn operation(&self, id: &str) -> Result<CancellationToken, String> {
        self.operations
            .lock()
            .map_err(|_| "ChatGPT requests are unavailable")?
            .get(id)
            .cloned()
            .ok_or_else(|| "ChatGPT request no longer exists".into())
    }
    fn finish(&self, id: &str) {
        if let Ok(mut operations) = self.operations.lock() {
            operations.remove(id);
        }
    }
    fn cancel_all(&self) {
        if let Ok(operations) = self.operations.lock() {
            for token in operations.values() {
                token.cancel();
            }
        }
    }
}

#[tauri::command]
pub fn chatgpt_start_operation(state: State<'_, ChatGptState>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    state
        .operations
        .lock()
        .map_err(|_| "ChatGPT requests are unavailable")?
        .insert(id.clone(), CancellationToken::new());
    Ok(id)
}

#[tauri::command]
pub fn chatgpt_cancel_operation(state: State<'_, ChatGptState>, id: String) {
    if let Ok(token) = state.operation(&id) {
        token.cancel();
    }
}

#[tauri::command]
pub async fn chatgpt_session(app: AppHandle) -> Result<Session, String> {
    if !available() || !vault_root(&app)?.join("credentials.enc").exists() {
        return Ok(public_session(&Vault::default()));
    }
    Ok(public_session(&open_vault(&app).await?.data))
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_type: String,
    expires_in: u64,
    scope: Option<String>,
    earliest_refresh_at: Option<u64>,
}

impl TokenResponse {
    fn into_tokens(self, old: Option<&Tokens>) -> Result<Tokens, String> {
        if !self.token_type.eq_ignore_ascii_case("bearer")
            || self.access_token.is_empty()
            || self.expires_in == 0
        {
            return Err("OpenAI returned an invalid token response".into());
        }
        Ok(Tokens {
            access_token: self.access_token,
            refresh_token: self
                .refresh_token
                .or_else(|| old.and_then(|t| t.refresh_token.clone())),
            id_token: self
                .id_token
                .or_else(|| old.and_then(|t| t.id_token.clone())),
            scope: self
                .scope
                .or_else(|| old.map(|t| t.scope.clone()))
                .unwrap_or_default(),
            expires_at: now().saturating_add(self.expires_in),
            earliest_refresh_at: self.earliest_refresh_at,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
struct Identity {
    sub: String,
    email: Option<String>,
    nonce: Option<String>,
    iat: u64,
}

fn validate_identity(
    token: &str,
    keys: &JwkSet,
    client_id: &str,
    nonce: Option<&str>,
) -> Result<Identity, String> {
    let header = decode_header(token).map_err(|_| "Invalid ChatGPT identity token")?;
    if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) {
        return Err("Unsupported ChatGPT identity signature".into());
    }
    let kid = header
        .kid
        .ok_or("ChatGPT identity token has no signing key")?;
    let jwk = keys
        .find(&kid)
        .ok_or("ChatGPT identity signing key was not found")?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| "Invalid ChatGPT identity signing key")?;
    let mut validation = Validation::new(header.alg);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[ISSUER]);
    validation.set_required_spec_claims(&["sub", "exp", "iss", "aud"]);
    validation.leeway = 5;
    validation.validate_nbf = true;
    let identity = decode::<Identity>(token, &key, &validation)
        .map_err(|_| "ChatGPT identity verification failed")?
        .claims;
    if identity.sub.is_empty()
        || identity.iat > now().saturating_add(5)
        || nonce.is_some_and(|expected| identity.nonce.as_deref() != Some(expected))
    {
        return Err("ChatGPT identity did not match this sign-in attempt".into());
    }
    Ok(identity)
}

async fn verify_identity(
    http: &Client,
    token: &str,
    client_id: &str,
    nonce: Option<&str>,
) -> Result<Identity, String> {
    let keys = http
        .get(format!("{ISSUER}/.well-known/jwks.json"))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| "Cannot verify ChatGPT identity: signing keys are unavailable")?
        .error_for_status()
        .map_err(|_| "Cannot load ChatGPT identity signing keys")?
        .json::<JwkSet>()
        .await
        .map_err(|_| "Invalid ChatGPT identity signing keys")?;
    validate_identity(token, &keys, client_id, nonce)
}

fn callback_code(
    url: &str,
    redirect: &str,
    state: &str,
    client_id: Option<&str>,
) -> Result<(String, String), String> {
    let url = Url::parse(url).map_err(|_| "Invalid ChatGPT sign-in callback")?;
    let expected = Url::parse(redirect).map_err(|_| "Invalid ChatGPT redirect")?;
    if url.origin() != expected.origin()
        || url.path() != expected.path()
        || url.fragment().is_some()
    {
        return Err("ChatGPT sign-in callback did not match this attempt".into());
    }
    let mut params = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params.insert(key.to_string(), value.to_string()).is_some() {
            return Err("Duplicate ChatGPT callback parameter".into());
        }
    }
    if params.get("state").map(String::as_str) != Some(state) {
        return Err("ChatGPT sign-in state did not match".into());
    }
    if params.contains_key("error") {
        return Err("ChatGPT sign-in was declined or could not be completed".into());
    }
    let issued = params
        .get("client_id")
        .map(String::as_str)
        .or(client_id)
        .filter(|id| !id.is_empty() && *id != "dynamic_agent_client")
        .ok_or("ChatGPT registration did not return a client ID")?;
    if client_id.is_some_and(|selected| issued != selected) {
        return Err("ChatGPT registration changed unexpectedly".into());
    }
    let code = params
        .get("code")
        .filter(|code| !code.is_empty())
        .ok_or("ChatGPT sign-in did not return a code")?;
    Ok((code.clone(), issued.to_owned()))
}

fn authorization_url(
    connection: Option<&Connection>,
    host_id: &str,
    redirect: &str,
    state: &str,
    nonce: &str,
    verifier: &str,
) -> String {
    let mut url = Url::parse(AUTHORIZE).expect("fixed OpenAI authorize URL");
    let mut query = url.query_pairs_mut();
    query.extend_pairs([
        (
            "client_id",
            connection.map_or("dynamic_agent_client", |connection| {
                connection.client_id.as_str()
            }),
        ),
        ("ext_agent_host_id", host_id),
        ("response_type", "code"),
        ("redirect_uri", redirect),
        ("scope", SCOPES),
        ("resource", RESOURCE),
        ("state", state),
        ("nonce", nonce),
        ("code_challenge_method", "S256"),
        (
            "code_challenge",
            &URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())),
        ),
    ]);
    if let Some(connection) = connection {
        if let Some(email) = &connection.email {
            query.append_pair("login_hint", email);
        }
        if let Some(id) = connection
            .tokens
            .as_ref()
            .and_then(|t| t.id_token.as_deref())
        {
            query.append_pair("id_token_hint", id);
        }
        if connection
            .tokens
            .as_ref()
            .is_some_and(|t| !has_scope(&t.scope))
        {
            query.append_pair("prompt", "consent");
        }
    } else {
        query.append_pair("agent_name_hint", "Hakawati");
    }
    drop(query);
    url.into()
}

#[tauri::command]
pub async fn chatgpt_sign_in(
    app: AppHandle,
    state: State<'_, ChatGptState>,
    id: String,
) -> Result<Session, String> {
    let cancel = state.operation(&id)?;
    let result = async {
        let _sign_in = state
            .sign_in
            .try_lock()
            .map_err(|_| "A ChatGPT sign-in is already in progress")?;
        let vault = open_vault(&app).await?;
        vault.save()?; // Persist the host identity before the browser opens.
        let selected = vault.data.connection.clone();
        let host_id = vault.data.host_id.clone();
        drop(vault);
        if cancel.is_cancelled() {
            return Err(CANCELLED.into());
        }
        let started = state.loopback.start_path(
            TcpListener::bind(("127.0.0.1", 0))
                .map_err(|_| "Cannot open the local ChatGPT sign-in callback")?,
            "/auth/callback",
        )?;
        let verifier = random_secret();
        let nonce = random_secret();
        let oauth_state = random_secret();
        let url = authorization_url(
            selected.as_ref(),
            &host_id,
            &started.redirect_uri,
            &oauth_state,
            &nonce,
            &verifier,
        );
        let listener_state = state.loopback.clone();
        let listener_id = started.id.clone();
        let wait = tauri::async_runtime::spawn_blocking(move || {
            listener_state.wait(&listener_id, Duration::from_secs(120))
        });
        let browser = app.opener().open_url(url, None::<&str>);
        if browser.is_err() {
            let _ = state.loopback.signal_cancel(&started.id);
            let _ = wait.await;
            return Err("Cannot open the system browser for ChatGPT sign-in".into());
        }
        let callback = tokio::select! {
            result = wait => result.map_err(|_| "ChatGPT callback listener stopped")?,
            _ = cancel.cancelled() => {
                let _ = state.loopback.signal_cancel(&started.id);
                return Err(CANCELLED.into());
            }
        }?;
        let (code, client_id) = callback_code(
            &callback,
            &started.redirect_uri,
            &oauth_state,
            selected.as_ref().map(|p| p.client_id.as_str()),
        )?;
        let connection_id = if let Some(connection) = &selected {
            connection.id.clone()
        } else {
            let mut vault = open_vault(&app).await?;
            if cancel.is_cancelled() {
                return Err(CANCELLED.into());
            }
            if vault.data.connection.is_some() {
                return Err("ChatGPT connection changed during sign-in. Try again.".into());
            }
            let connection_id = uuid::Uuid::new_v4().to_string();
            // Retain registration on exchange failure so the next attempt can reuse it.
            vault.data.connection = Some(Connection {
                id: connection_id.clone(),
                client_id: client_id.clone(),
                subject: None,
                email: None,
                tokens: None,
            });
            vault.save()?;
            connection_id
        };
        let http = client()?;
        let exchange = async {
            let response = http
                .post(TOKEN)
                .timeout(Duration::from_secs(30))
                .form(&[
                    ("grant_type", "authorization_code"),
                    ("client_id", &client_id),
                    ("code", &code),
                    ("code_verifier", &verifier),
                    ("redirect_uri", &started.redirect_uri),
                    ("resource", RESOURCE),
                ])
                .send()
                .await
                .map_err(|_| "ChatGPT token exchange could not connect")?;
            if !response.status().is_success() {
                return Err(
                    "ChatGPT token exchange failed. Continue with ChatGPT to try again."
                        .to_string(),
                );
            }
            let tokens = response
                .json::<TokenResponse>()
                .await
                .map_err(|_| "Invalid ChatGPT token response")?;
            let identity = verify_identity(
                &http,
                tokens
                    .id_token
                    .as_deref()
                    .ok_or("ChatGPT did not return an identity token")?,
                &client_id,
                Some(&nonce),
            )
            .await?;
            if selected
                .as_ref()
                .and_then(|p| p.subject.as_deref())
                .is_some_and(|sub| sub != identity.sub)
            {
                return Err("The signed-in ChatGPT account does not match this connection".into());
            }
            Ok((identity, tokens.into_tokens(None)?))
        };
        let (identity, tokens) = tokio::select! {
            result = exchange => result?,
            _ = cancel.cancelled() => return Err(CANCELLED.into()),
        };
        let mut vault = open_vault(&app).await?;
        if cancel.is_cancelled() {
            return Err(CANCELLED.into());
        }
        let connection = vault
            .data
            .connection
            .as_mut()
            .filter(|connection| connection.id == connection_id)
            .ok_or("ChatGPT connection no longer exists")?;
        connection.subject = Some(identity.sub);
        connection.email = identity.email;
        connection.tokens = Some(tokens);
        vault.save()?;
        Ok(public_session(&vault.data))
    }
    .await;
    state.finish(&id);
    result
}

fn terminal_refresh_error(code: &str) -> bool {
    matches!(
        code,
        "invalid_grant"
            | "invalid_refresh_token"
            | "token_expired"
            | "refresh_token_expired"
            | "refresh_token_invalidated"
            | "refresh_token_reused"
    )
}

async fn access_token(app: &AppHandle, http: &Client) -> Result<String, String> {
    let mut vault = open_vault(app).await?;
    let connection = vault
        .data
        .connection
        .clone()
        .ok_or("Continue with ChatGPT in provider settings first")?;
    let tokens = connection
        .tokens
        .as_ref()
        .ok_or("Sign in to ChatGPT again in provider settings")?;
    if !has_scope(&tokens.scope) {
        return Err(
            "Enable ChatGPT plan usage in provider settings before requesting inference".into(),
        );
    }
    if tokens.expires_at > now() + 60
        || tokens
            .earliest_refresh_at
            .is_some_and(|earliest| earliest > now() && tokens.expires_at > now())
    {
        return Ok(tokens.access_token.clone());
    }
    let refresh = tokens
        .refresh_token
        .as_deref()
        .ok_or("Sign in to ChatGPT again in provider settings")?;
    let response = http
        .post(TOKEN)
        .timeout(Duration::from_secs(30))
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", connection.client_id.as_str()),
            ("refresh_token", refresh),
            ("resource", RESOURCE),
        ])
        .send()
        .await
        .map_err(|_| "ChatGPT could not renew access. Check your connection and try again.")?;
    if !response.status().is_success() {
        let body = response
            .json::<serde_json::Value>()
            .await
            .unwrap_or_default();
        let code = body
            .get("error")
            .and_then(|e| {
                e.as_str()
                    .or_else(|| e.get("code").and_then(|c| c.as_str()))
            })
            .unwrap_or("");
        if terminal_refresh_error(code) {
            vault.data.connection = Some(Connection {
                tokens: None,
                ..connection
            });
            vault.save()?;
            return Err("ChatGPT session expired. Sign in again in provider settings.".into());
        }
        return Err(
            "ChatGPT could not renew access. Try again later or reconnect in provider settings."
                .into(),
        );
    }
    let mut replacement = response
        .json::<TokenResponse>()
        .await
        .map_err(|_| "Invalid ChatGPT refresh response")?;
    // Refresh renews this exact client/session; it does not select an identity.
    // Keep the ID token already verified at sign-in as the returning-login hint.
    // Fetching JWKS here could lose a rotated refresh token on a network failure.
    replacement.id_token = tokens.id_token.clone();
    let replacement = replacement.into_tokens(Some(tokens))?;
    let access = replacement.access_token.clone();
    let permitted = has_scope(&replacement.scope);
    vault.data.connection = Some(Connection {
        tokens: Some(replacement),
        ..connection
    });
    vault.save()?; // Persist both rotated tokens together before another request can read them.
    if !permitted {
        return Err(
            "ChatGPT plan usage is no longer enabled. Reconnect in provider settings.".into(),
        );
    }
    Ok(access)
}

fn request_target(path: &str, body: Option<&str>) -> Result<&'static str, String> {
    match (path, body) {
        ("/models", None) => Ok("https://api.openai.com/v1/models"),
        ("/responses", Some(body)) => {
            let value: serde_json::Value =
                serde_json::from_str(body).map_err(|_| "Invalid ChatGPT request body")?;
            if value.get("stream") != Some(&serde_json::Value::Bool(true))
                || value.get("store") != Some(&serde_json::Value::Bool(false))
            {
                return Err("ChatGPT requests require stream: true and store: false".into());
            }
            Ok("https://api.openai.com/v1/responses")
        }
        _ => Err("Unsupported ChatGPT inference endpoint".into()),
    }
}

#[tauri::command]
pub async fn chatgpt_request(
    app: AppHandle,
    state: State<'_, ChatGptState>,
    id: String,
    path: String,
    body: Option<String>,
    on_event: Channel<HttpEvent>,
) -> Result<(), String> {
    let cancel = state.operation(&id)?;
    let request = async {
        let target = request_target(&path, body.as_deref())?;
        let http = client()?;
        // Finish a started refresh even on cancellation: dropping a refresh response
        // can discard a rotated token and make the entire session unusable.
        if cancel.is_cancelled() {
            return Err(CANCELLED.into());
        }
        let token = access_token(&app, &http).await?;
        if cancel.is_cancelled() {
            return Err(CANCELLED.into());
        }
        let request = if let Some(body) = body {
            http.post(target)
                .header("content-type", "application/json")
                .body(body)
        } else {
            http.get(target)
        };
        let stream = async {
            let mut response = request
                .bearer_auth(token)
                .send()
                .await
                .map_err(|_| "Cannot connect to ChatGPT")?;
            let headers = response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .to_str()
                        .ok()
                        .map(|value| (name.to_string(), value.to_string()))
                })
                .collect();
            on_event
                .send(HttpEvent::Headers {
                    status: response.status().as_u16(),
                    headers,
                })
                .map_err(|_| CANCELLED)?;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "ChatGPT response stream was interrupted")?
            {
                on_event
                    .send(HttpEvent::Chunk {
                        data: chunk.to_vec(),
                    })
                    .map_err(|_| CANCELLED)?;
            }
            on_event.send(HttpEvent::End).map_err(|_| CANCELLED)?;
            Ok(())
        };
        tokio::select! {
            result = stream => result,
            _ = cancel.cancelled() => Err(CANCELLED.into()),
        }
    }
    .await;
    state.finish(&id);
    request
}

#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    revocation_endpoint: Option<String>,
}

fn trusted_auth_endpoint(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("auth.openai.com")
            && url.port_or_known_default() == Some(443)
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
    })
}

async fn revoke(http: &Client, connection: &Connection) -> bool {
    let Some(refresh) = connection
        .tokens
        .as_ref()
        .and_then(|t| t.refresh_token.as_deref())
    else {
        return true;
    };
    let discovery = match http
        .get(format!("{ISSUER}/.well-known/openid-configuration"))
        .timeout(Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response.json::<Discovery>().await.ok(),
        _ => None,
    };
    let Some(endpoint) = discovery
        .filter(|d| d.issuer == ISSUER)
        .and_then(|d| d.revocation_endpoint)
        .filter(|url| trusted_auth_endpoint(url))
    else {
        return false;
    };
    for attempt in 0..3 {
        let response = http
            .post(&endpoint)
            .timeout(Duration::from_secs(10))
            .form(&[
                ("token", refresh),
                ("token_type_hint", "refresh_token"),
                ("client_id", connection.client_id.as_str()),
            ])
            .send()
            .await;
        match response {
            Ok(response) if response.status() == reqwest::StatusCode::OK => return true,
            Ok(response) if !response.status().is_server_error() => return false,
            _ => {}
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(250 * (1 << attempt))).await;
        }
    }
    false
}

#[tauri::command]
pub async fn chatgpt_sign_out(
    app: AppHandle,
    state: State<'_, ChatGptState>,
) -> Result<SignOutResult, String> {
    state.cancel_all();
    let mut vault = open_vault(&app).await?;
    let remote_revocation_confirmed = if let Some(connection) = &vault.data.connection {
        match client() {
            Ok(http) => revoke(&http, connection).await,
            Err(_) => false,
        }
    } else {
        true
    };
    // Revocation ends the session, not the app registration. Retain the issued
    // client and host IDs so signing in again reuses the same ChatGPT app.
    vault.data.clear_tokens();
    vault.save()?;
    Ok(SignOutResult {
        remote_revocation_confirmed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const REDIRECT: &str = "http://127.0.0.1:4321/auth/callback";

    #[test]
    fn verifies_signature_issuer_audience_expiry_and_nonce_before_trusting_identity() {
        use jsonwebtoken::{encode, EncodingKey, Header};
        use p256::{elliptic_curve::sec1::ToEncodedPoint, pkcs8::EncodePrivateKey, SecretKey};
        let private = SecretKey::random(&mut OsRng);
        let public = private.public_key().to_encoded_point(false);
        let keys: JwkSet = serde_json::from_value(serde_json::json!({ "keys": [{
            "kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "test-key",
            "x": URL_SAFE_NO_PAD.encode(public.x().unwrap()), "y": URL_SAFE_NO_PAD.encode(public.y().unwrap()),
        }]})).unwrap();
        let der = private.to_pkcs8_der().unwrap();
        let encoding = EncodingKey::from_ec_der(der.as_bytes());
        let header = Header {
            kid: Some("test-key".into()),
            ..Header::new(Algorithm::ES256)
        };
        let claims = serde_json::json!({ "sub": "verified-subject", "email": "example@example.com", "iss": ISSUER,
            "aud": "oaiapp_test", "exp": now() + 3600, "iat": now(), "nonce": "expected-nonce" });
        let token = encode(&header, &claims, &encoding).unwrap();
        assert_eq!(
            validate_identity(&token, &keys, "oaiapp_test", Some("expected-nonce"))
                .unwrap()
                .sub,
            "verified-subject"
        );
        assert!(validate_identity(&token, &keys, "oaiapp_other", Some("expected-nonce")).is_err());
        assert!(validate_identity(&token, &keys, "oaiapp_test", Some("wrong-nonce")).is_err());
        for (field, invalid) in [
            ("iss", serde_json::json!("https://attacker.example")),
            ("exp", serde_json::json!(now() - 60)),
            ("sub", serde_json::json!("")),
        ] {
            let mut bad = claims.clone();
            bad[field] = invalid;
            let token = encode(&header, &bad, &encoding).unwrap();
            assert!(
                validate_identity(&token, &keys, "oaiapp_test", Some("expected-nonce")).is_err()
            );
        }
        let mut missing = claims.clone();
        missing.as_object_mut().unwrap().remove("iat");
        let token = encode(&header, &missing, &encoding).unwrap();
        assert!(validate_identity(&token, &keys, "oaiapp_test", Some("expected-nonce")).is_err());
        let other_private = SecretKey::random(&mut OsRng).to_pkcs8_der().unwrap();
        let forged = encode(
            &header,
            &claims,
            &EncodingKey::from_ec_der(other_private.as_bytes()),
        )
        .unwrap();
        assert!(validate_identity(&forged, &keys, "oaiapp_test", Some("expected-nonce")).is_err());
    }

    #[test]
    fn public_session_never_serializes_tokens_or_client_registration_and_requires_granted_scope() {
        let mut data = Vault {
            host_id: "urn:uuid:host".into(),
            connection: Some(Connection {
                id: "account".into(),
                client_id: "oaiapp_private-registration".into(),
                subject: Some("verified-subject".into()),
                email: None,
                tokens: Some(Tokens {
                    access_token: "private-access".into(),
                    refresh_token: Some("private-refresh".into()),
                    id_token: Some("private-id".into()),
                    scope: "openid email".into(),
                    expires_at: now() + 3600,
                    earliest_refresh_at: None,
                }),
            }),
        };
        let session = public_session(&data);
        assert!(session.connected);
        assert_eq!(session.account.as_ref().unwrap().id, "account");
        assert!(!session.plan_usage_enabled);
        let json = serde_json::to_string(&session).unwrap();
        for secret in [
            "private-access",
            "private-refresh",
            "private-id",
            "oaiapp_private-registration",
            "urn:uuid:host",
        ] {
            assert!(!json.contains(secret));
        }
        data.connection
            .as_mut()
            .unwrap()
            .tokens
            .as_mut()
            .unwrap()
            .scope = DIRECT_SCOPE.into();
        assert!(public_session(&data).plan_usage_enabled);
        data.clear_tokens();
        assert!(!public_session(&data).connected);
        assert!(public_session(&data).account.is_none());
        assert_eq!(
            data.connection.as_ref().unwrap().client_id,
            "oaiapp_private-registration"
        );
        data.connection.as_mut().unwrap().subject = None;
        assert!(public_session(&data).account.is_none());
    }

    #[test]
    fn callback_binds_state_redirect_and_issued_registration() {
        assert_eq!(
            callback_code(
                &format!("{REDIRECT}?code=code&state=nonce&client_id=oaiapp_test"),
                REDIRECT,
                "nonce",
                None
            )
            .unwrap(),
            ("code".into(), "oaiapp_test".into())
        );
        for url in [
            format!("{REDIRECT}?code=code&state=wrong&client_id=oaiapp_test"),
            format!("{REDIRECT}?code=code&state=nonce"),
            format!("{REDIRECT}?code=code&state=nonce&client_id=dynamic_agent_client"),
            format!("{REDIRECT}?code=code&state=nonce&state=nonce&client_id=oaiapp_test"),
            format!("{REDIRECT}?error=access_denied&state=nonce&client_id=oaiapp_test"),
            "http://localhost:4321/auth/callback?code=code&state=nonce&client_id=oaiapp_test"
                .into(),
        ] {
            assert!(callback_code(&url, REDIRECT, "nonce", None).is_err());
        }
        assert!(callback_code(
            &format!("{REDIRECT}?code=code&state=nonce&client_id=oaiapp_other"),
            REDIRECT,
            "nonce",
            Some("oaiapp_test")
        )
        .is_err());
        assert_eq!(
            callback_code(
                &format!("{REDIRECT}?code=code&state=nonce"),
                REDIRECT,
                "nonce",
                Some("oaiapp_test")
            )
            .unwrap()
            .1,
            "oaiapp_test"
        );
    }

    #[test]
    fn authorization_uses_pkce_and_reuses_saved_registration_without_agent_hint() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let initial = Url::parse(&authorization_url(
            None,
            "urn:uuid:host",
            REDIRECT,
            "state",
            "nonce",
            verifier,
        ))
        .unwrap();
        let params: HashMap<_, _> = initial.query_pairs().collect();
        assert_eq!(
            params["code_challenge"],
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(params["agent_name_hint"], "Hakawati");
        let saved = Connection {
            id: "account".into(),
            client_id: "oaiapp_saved".into(),
            subject: Some("sub".into()),
            email: Some("a+b@example.com".into()),
            tokens: None,
        };
        let url = Url::parse(&authorization_url(
            Some(&saved),
            "urn:uuid:host",
            REDIRECT,
            "state",
            "nonce",
            verifier,
        ))
        .unwrap();
        let params: HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(params["client_id"], "oaiapp_saved");
        assert_eq!(params["login_hint"], "a+b@example.com");
        assert!(!params.contains_key("agent_name_hint"));
        assert!(!params.contains_key("id_token_hint"));
    }

    #[test]
    fn sign_out_roundtrip_reuses_registration_without_retaining_any_tokens() {
        let mut data = Vault {
            host_id: "urn:uuid:stable-host".into(),
            connection: Some(Connection {
                id: "stable-account".into(),
                client_id: "oaiapp_existing".into(),
                subject: Some("verified-subject".into()),
                email: Some("saved@example.com".into()),
                tokens: Some(Tokens {
                    access_token: "secret-access".into(),
                    refresh_token: Some("secret-refresh".into()),
                    id_token: Some("secret-identity".into()),
                    scope: DIRECT_SCOPE.into(),
                    expires_at: now() + 3600,
                    earliest_refresh_at: None,
                }),
            }),
        };
        data.clear_tokens();
        let serialized = serde_json::to_string(&data).unwrap();
        for secret in ["secret-access", "secret-refresh", "secret-identity"] {
            assert!(!serialized.contains(secret));
        }
        let reloaded: Vault = serde_json::from_str(&serialized).unwrap();
        let connection = reloaded.connection.as_ref().unwrap();
        assert_eq!(connection.id, "stable-account");
        assert_eq!(connection.subject.as_deref(), Some("verified-subject"));
        let session = public_session(&reloaded);
        assert!(!session.connected);
        assert!(!session.plan_usage_enabled);
        assert!(session.account.is_none());

        let url = Url::parse(&authorization_url(
            Some(connection),
            &reloaded.host_id,
            REDIRECT,
            "fresh-state",
            "fresh-nonce",
            "fresh-verifier",
        ))
        .unwrap();
        let params: HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(params["client_id"], "oaiapp_existing");
        assert_eq!(params["ext_agent_host_id"], "urn:uuid:stable-host");
        assert_eq!(params["login_hint"], "saved@example.com");
        assert_eq!(params["state"], "fresh-state");
        assert_eq!(params["nonce"], "fresh-nonce");
        assert!(!params.contains_key("agent_name_hint"));
        assert!(!params.contains_key("id_token_hint"));
        assert!(callback_code(
            &format!("{REDIRECT}?code=new-code&state=fresh-state&client_id=oaiapp_other"),
            REDIRECT,
            "fresh-state",
            Some(&connection.client_id),
        )
        .is_err());
    }

    #[test]
    fn transport_only_accepts_documented_routes_and_private_streaming() {
        assert!(request_target("/models", None).is_ok());
        assert!(request_target("/responses", Some(r#"{"stream":true,"store":false}"#)).is_ok());
        for path in [
            "https://attacker.example",
            "/models?redirect=x",
            "/chat/completions",
            "/../models",
        ] {
            assert!(request_target(path, None).is_err());
        }
        assert!(request_target("/responses", Some(r#"{"stream":true,"store":true}"#)).is_err());
        assert!(!trusted_auth_endpoint(
            "https://auth.openai.com.attacker.example/revoke"
        ));
        assert!(!trusted_auth_endpoint("http://auth.openai.com/revoke"));
        assert!(trusted_auth_endpoint(
            "https://auth.openai.com/api/oauth/revoke"
        ));
    }

    #[test]
    fn refresh_rotation_preserves_omitted_scope_and_clears_only_terminal_errors() {
        let old = Tokens {
            access_token: "old".into(),
            refresh_token: Some("refresh-old".into()),
            id_token: None,
            scope: DIRECT_SCOPE.into(),
            expires_at: 0,
            earliest_refresh_at: None,
        };
        let updated = TokenResponse {
            access_token: "new".into(),
            refresh_token: Some("refresh-new".into()),
            id_token: None,
            token_type: "Bearer".into(),
            expires_in: 3600,
            scope: None,
            earliest_refresh_at: None,
        }
        .into_tokens(Some(&old))
        .unwrap();
        assert_eq!(updated.refresh_token.as_deref(), Some("refresh-new"));
        assert!(has_scope(&updated.scope));
        assert!(terminal_refresh_error("refresh_token_reused"));
        assert!(!terminal_refresh_error("server_error"));
        assert!(!terminal_refresh_error("invalid_client"));
    }
}
