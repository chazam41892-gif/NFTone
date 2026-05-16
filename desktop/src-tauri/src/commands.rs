// Placeholder — populated in Commit 2.
use crate::error::AppResult;

#[tauri::command]
pub async fn app_version() -> AppResult<String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn open_external(_url: String) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub async fn request_wallet_signin(_wallet_provider: String) -> AppResult<String> {
    Ok(String::new())
}

#[tauri::command]
pub async fn session_set(_key: String, _value: String) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub async fn session_get(_key: String) -> AppResult<Option<String>> {
    Ok(None)
}

#[tauri::command]
pub async fn session_clear(_key: String) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub async fn watermarker_health() -> AppResult<bool> {
    Ok(false)
}

#[tauri::command]
pub async fn watermarker_embed(_audio_path: String, _release_id: String, _wallet_id: String) -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({"status": "not_implemented"}))
}

#[tauri::command]
pub async fn watermarker_detect(_audio_path: String, _release_id: Option<String>) -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({"status": "not_implemented"}))
}

#[tauri::command]
pub async fn check_for_updates() -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({"available": false}))
}
