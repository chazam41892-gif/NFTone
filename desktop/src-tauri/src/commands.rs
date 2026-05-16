//! Tauri IPC commands invoked from the webview (Next.js frontend).
//!
//! Naming convention: snake_case Rust, exposed to JS as the same name.
//! From the frontend: `invoke('watermarker_health')`.

use crate::error::{AppError, AppResult};
use crate::sidecar::WATERMARKER_PORT;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

fn watermarker_base() -> String {
    format!("http://127.0.0.1:{WATERMARKER_PORT}")
}

fn http_client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?)
}

// ---------- App meta ----------

#[tauri::command]
pub async fn app_version() -> AppResult<String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> AppResult<()> {
    app.shell()
        .open(url, None)
        .map_err(|e| AppError::Other(format!("shell open: {e}")))?;
    Ok(())
}

// ---------- Wallet sign-in flow ----------
//
// Phantom (and other Solana wallets) don't have a desktop-app integration
// path — they live in the browser extension. The flow we kick off here:
//
//   1. Open the user's default browser to NFTones' /signin-desktop page
//      with a one-time `state` token in the URL.
//   2. That web page does the normal Phantom signMessage flow.
//   3. After signing, the web page redirects to `nftones://auth/callback?
//      state=...&wallet=...&signature=...&nonce=...`.
//   4. The OS routes the deep-link back to this app. Our deep-link
//      handler in lib.rs::setup emits an event the webview listens for
//      and completes the NextAuth credentials flow.

#[derive(Serialize)]
pub struct WalletSigninRequest {
    pub state: String,
    pub callback_url: String,
}

#[tauri::command]
pub async fn request_wallet_signin(
    app: AppHandle,
    signin_url: String,
) -> AppResult<WalletSigninRequest> {
    // Generate a one-time `state` token. The frontend stores it and matches
    // it against the deep-link callback to defeat callback-injection.
    let state = uuid_v4();
    let callback_url = "nftones://auth/callback".to_string();
    let full_url = format!(
        "{signin_url}?desktop=1&state={state}&callback={callback_url}"
    );
    app.shell()
        .open(full_url, None)
        .map_err(|e| AppError::Other(format!("shell open: {e}")))?;
    Ok(WalletSigninRequest {
        state,
        callback_url,
    })
}

// Cheap RFC-4122-shaped token. Not crypto-grade UUID v4 — we just need
// uniqueness per sign-in attempt. Frontend can substitute crypto.randomUUID
// when desired.
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:032x}", n)
}

// ---------- Session storage (OS keychain via crate::session) ----------

#[tauri::command]
pub async fn session_set(key: String, value: String) -> AppResult<()> {
    crate::session::set(&key, &value)
}

#[tauri::command]
pub async fn session_get(key: String) -> AppResult<Option<String>> {
    crate::session::get(&key)
}

#[tauri::command]
pub async fn session_clear(key: String) -> AppResult<()> {
    crate::session::clear(&key)
}

// ---------- Watermarker (talks to bundled sidecar on 127.0.0.1:8501) ----------

#[tauri::command]
pub async fn watermarker_health() -> AppResult<bool> {
    let resp = http_client()?
        .get(format!("{}/api/v1/health", watermarker_base()))
        .timeout(Duration::from_secs(3))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or(serde_json::json!({}));
            Ok(body.get("status").and_then(|v| v.as_str()) == Some("ok"))
        }
        _ => Ok(false),
    }
}

#[derive(Serialize, Deserialize)]
pub struct EmbedResult {
    pub watermarked_path: String,
    pub master_sha256: String,
    pub derivative_sha256: String,
    pub wallet_fingerprint: String,
    pub format: String,
}

#[tauri::command]
pub async fn watermarker_embed(
    audio_path: String,
    release_id: String,
    wallet_id: String,
) -> AppResult<EmbedResult> {
    let src = PathBuf::from(&audio_path);
    if !src.exists() {
        return Err(AppError::Other(format!("file not found: {audio_path}")));
    }
    let bytes = tokio::fs::read(&src).await?;
    let filename = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("audio.wav")
        .to_string();
    let mime = mime_for(&filename);

    let form = reqwest::multipart::Form::new()
        .text("release_id", release_id)
        .text("wallet_id", wallet_id)
        .part(
            "audio",
            reqwest::multipart::Part::bytes(bytes)
                .file_name(filename.clone())
                .mime_str(&mime)
                .map_err(reqwest::Error::from)?,
        );

    let resp = http_client()?
        .post(format!("{}/api/v1/watermark/embed", watermarker_base()))
        .multipart(form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("embed failed: {status} {text}")));
    }

    // Watermarker returns the watermarked audio body + custom x-* headers.
    let headers = resp.headers().clone();
    let bytes = resp.bytes().await?;

    let out_dir = std::env::temp_dir().join("nftones-watermarked");
    tokio::fs::create_dir_all(&out_dir).await?;
    let out_path = out_dir.join(format!(
        "{}_{}",
        chrono_unix_ts(),
        filename
    ));
    tokio::fs::write(&out_path, &bytes).await?;

    fn header(h: &reqwest::header::HeaderMap, k: &str) -> String {
        h.get(k)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string()
    }

    Ok(EmbedResult {
        watermarked_path: out_path.to_string_lossy().to_string(),
        master_sha256: header(&headers, "x-master-sha256"),
        derivative_sha256: header(&headers, "x-derivative-sha256"),
        wallet_fingerprint: header(&headers, "x-wallet-fingerprint"),
        format: header(&headers, "x-format"),
    })
}

#[derive(Serialize, Deserialize)]
pub struct DetectResult {
    pub matched: bool,
    pub wallet_id: Option<String>,
    pub wallet_fingerprint: Option<String>,
    pub correlation: f64,
    pub confidence: String,
    pub wallets_searched: u64,
    pub threshold: f64,
}

#[tauri::command]
pub async fn watermarker_detect(
    audio_path: String,
    release_id: Option<String>,
) -> AppResult<DetectResult> {
    let src = PathBuf::from(&audio_path);
    if !src.exists() {
        return Err(AppError::Other(format!("file not found: {audio_path}")));
    }
    let bytes = tokio::fs::read(&src).await?;
    let filename = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("audio.wav")
        .to_string();
    let mime = mime_for(&filename);

    let mut form = reqwest::multipart::Form::new().part(
        "audio",
        reqwest::multipart::Part::bytes(bytes)
            .file_name(filename)
            .mime_str(&mime)
            .map_err(reqwest::Error::from)?,
    );
    if let Some(rid) = release_id {
        form = form.text("release_id", rid);
    }

    let resp = http_client()?
        .post(format!("{}/api/v1/watermark/detect", watermarker_base()))
        .multipart(form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("detect failed: {status} {text}")));
    }

    let raw: serde_json::Value = resp.json().await?;
    Ok(DetectResult {
        matched: raw.get("matched").and_then(|v| v.as_bool()).unwrap_or(false),
        wallet_id: raw
            .get("wallet_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        wallet_fingerprint: raw
            .get("wallet_fingerprint")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        correlation: raw
            .get("correlation")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        confidence: raw
            .get("confidence")
            .and_then(|v| v.as_str())
            .unwrap_or("none")
            .to_string(),
        wallets_searched: raw
            .get("wallets_searched")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        threshold: raw
            .get("threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
    })
}

fn mime_for(filename: &str) -> String {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" | "mp4" | "aac" => "audio/mp4",
        "flac" => "audio/flac",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn chrono_unix_ts() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ---------- Updater (tauri-plugin-updater) ----------

/// Check the updater endpoint configured in tauri.conf.json.
/// Frontend can then choose to call `updater_install` to apply.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> AppResult<serde_json::Value> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app
        .updater()
        .map_err(|e| AppError::Other(format!("updater init: {e}")))?;
    match updater.check().await {
        Ok(Some(update)) => Ok(serde_json::json!({
            "available": true,
            "version": update.version,
            "current_version": update.current_version,
            "date": update.date.map(|d| d.to_string()),
            "body": update.body,
        })),
        Ok(None) => Ok(serde_json::json!({"available": false})),
        Err(e) => Ok(serde_json::json!({"available": false, "error": e.to_string()})),
    }
}

/// Download + install the available update, then exit so the new version
/// launches on next start. The frontend should warn the user before calling.
#[tauri::command]
pub async fn updater_install(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app
        .updater()
        .map_err(|e| AppError::Other(format!("updater init: {e}")))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| AppError::Other(format!("updater check: {e}")))?
    else {
        return Err(AppError::Other("no update available".into()));
    };
    update
        .download_and_install(|_chunk_len, _total| {}, || {})
        .await
        .map_err(|e| AppError::Other(format!("install failed: {e}")))?;
    app.exit(0);
    Ok(())
}
