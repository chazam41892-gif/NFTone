//! Sidecar process management.
//!
//! Spawns the bundled `audio_watermarker` binary on app startup and keeps a
//! handle so commands can talk to it on localhost. The binary is the Python
//! `services/audio_watermarker` FastAPI service, frozen via pyinstaller and
//! dropped at `desktop/src-tauri/binaries/audio_watermarker(-<target-triple>)`.
//!
//! If the sidecar binary isn't present (developer hasn't built it yet), we
//! log a warning and continue — backend commands that need it will return a
//! "sidecar unavailable" error, and the UI can fall back to the cloud
//! watermarker URL.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Port the bundled watermarker listens on. Kept in lockstep with the
/// `--port` arg passed to the sidecar below and with `WATERMARKER_BASE` in
/// `commands.rs`.
pub const WATERMARKER_PORT: u16 = 8501;

#[derive(Default)]
pub struct SidecarState {
    pub child: Mutex<Option<CommandChild>>,
}

pub fn spawn_watermarker(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(SidecarState::default());

    let sidecar = match app
        .shell()
        .sidecar("audio_watermarker")
    {
        Ok(cmd) => cmd,
        Err(e) => {
            log::warn!(
                "Watermarker sidecar not bundled ({e}). \
                 Drop a pyinstaller'd binary at \
                 desktop/src-tauri/binaries/audio_watermarker(-<triple>)\
                 .exe before `tauri build`."
            );
            return Ok(());
        }
    };

    let (mut rx, child) = sidecar
        .args([
            "--host", "127.0.0.1",
            "--port", &WATERMARKER_PORT.to_string(),
        ])
        .spawn()?;

    {
        let state: State<'_, SidecarState> = app.state();
        *state.child.lock().unwrap() = Some(child);
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[watermarker] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("[watermarker] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    log::error!("[watermarker] error: {err}");
                }
                CommandEvent::Terminated(payload) => {
                    log::warn!(
                        "[watermarker] terminated (code={:?}, signal={:?})",
                        payload.code, payload.signal
                    );
                    let state: State<'_, SidecarState> = app_handle.state();
                    *state.child.lock().unwrap() = None;
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Kill the sidecar — invoked on graceful shutdown.
pub fn kill_watermarker(app: &AppHandle) {
    let state: State<'_, SidecarState> = app.state();
    let child = state.child.lock().unwrap().take();
    if let Some(child) = child {
        let _ = child.kill();
    }
}
