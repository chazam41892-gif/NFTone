mod commands;
mod sidecar;
mod session;
mod error;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            sidecar::spawn_watermarker(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::open_external,
            commands::request_wallet_signin,
            commands::session_set,
            commands::session_get,
            commands::session_clear,
            commands::watermarker_health,
            commands::watermarker_embed,
            commands::watermarker_detect,
            commands::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NFTones desktop");
}
