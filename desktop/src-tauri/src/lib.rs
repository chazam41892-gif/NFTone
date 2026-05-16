mod commands;
mod sidecar;
mod session;
mod error;

use tauri::{Emitter, RunEvent};

/// Where the webview points by default in dev builds. Prod points at
/// `https://nftones.app` (configured in tauri.conf.json → windows[0].url).
/// In debug builds we re-navigate to localhost so `npm run dev` against the
/// Next.js app at :3000 works.
///
/// Override at runtime by setting `NFTONES_DESKTOP_URL` before launch —
/// useful for QA against a preview deploy without rebuilding the shell.
const DEV_FALLBACK_URL: &str = "http://localhost:3000";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Register nftones:// scheme + bind a handler that re-emits the
            // URL into the webview as a `deep-link` event. The frontend
            // listens with: listen('deep-link', e => ...).
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event
                        .urls()
                        .into_iter()
                        .map(|u| u.to_string())
                        .collect();
                    let _ = handle.emit("deep-link", &urls);
                });
                let _ = app.deep_link().register_all();
            }

            // Dev-build URL override. Prod stays on the JSON-configured URL
            // (https://nftones.app). Debug builds and NFTONES_DESKTOP_URL
            // overrides re-navigate the main window after creation.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                let override_url = std::env::var("NFTONES_DESKTOP_URL").ok();
                let target = override_url.as_deref().or_else(|| {
                    if cfg!(debug_assertions) {
                        Some(DEV_FALLBACK_URL)
                    } else {
                        None
                    }
                });
                if let Some(url) = target {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(parsed) = url.parse() {
                            let _ = window.navigate(parsed);
                        }
                    }
                }
            }

            // Spin up the bundled watermarker sidecar (no-op if binary
            // missing — see sidecar.rs).
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
            commands::pick_audio_file,
            commands::check_for_updates,
            commands::updater_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building NFTones desktop");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            sidecar::kill_watermarker(app_handle);
        }
    });
}
