mod log_watcher;
mod settings;

use settings::Settings;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    dir: PathBuf,
    settings: Mutex<Settings>,
    watcher: Mutex<Option<Arc<AtomicBool>>>,
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

const MAX_GUIDE_BYTES: u64 = 5 * 1024 * 1024;

/// Only guide files: limits what the webview can read through this command.
fn read_guide(path: &std::path::Path) -> Result<String, String> {
    let is_json = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err(format!("只能讀取 .json 攻略檔: {}", path.display()));
    }
    let len = std::fs::metadata(path).map_err(|e| format!("無法讀取 {}: {e}", path.display()))?.len();
    if len > MAX_GUIDE_BYTES {
        return Err(format!("攻略檔過大（{len} bytes，上限 5 MB）"));
    }
    std::fs::read_to_string(path).map_err(|e| format!("無法讀取 {}: {e}", path.display()))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    read_guide(std::path::Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_guide_rejects_non_json_paths() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("secret.txt");
        std::fs::write(&p, "x").unwrap();
        assert!(read_guide(&p).unwrap_err().contains(".json"));
    }

    #[test]
    fn read_guide_rejects_huge_files() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("big.json");
        std::fs::File::create(&p).unwrap().set_len(6 * 1024 * 1024).unwrap();
        assert!(read_guide(&p).is_err());
    }

    #[test]
    fn read_guide_reads_json() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("g.JSON");
        std::fs::write(&p, "{}").unwrap();
        assert_eq!(read_guide(&p).unwrap(), "{}");
    }
}

/// Callback-based picker: does not block an async-runtime worker thread while the dialog is open.
async fn pick(app: AppHandle, name: &str, ext: &str) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().add_filter(name, &[ext]).pick_file(move |p| {
        let _ = tx.send(p);
    });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_guide_file(app: AppHandle) -> Option<String> {
    pick(app, "攻略 JSON", "json").await
}

#[tauri::command]
async fn pick_log_file(app: AppHandle) -> Option<String> {
    pick(app, "Client.txt", "txt").await
}

#[tauri::command]
fn set_guide_path(state: State<AppState>, path: String) -> Result<(), String> {
    let mut s = state.settings.lock().unwrap();
    s.guide_path = Some(path);
    settings::save(&state.dir, &s).map_err(|e| e.to_string())
}

/// Saves the overlay window's current position (after the user dragged it in move mode).
#[tauri::command]
fn save_window_position(window: tauri::WebviewWindow, state: State<AppState>) -> Result<(), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let mut s = state.settings.lock().unwrap();
    s.window_x = Some(pos.x);
    s.window_y = Some(pos.y);
    settings::save(&state.dir, &s).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_opacity(state: State<AppState>, opacity: f64) -> Result<(), String> {
    let mut s = state.settings.lock().unwrap();
    s.opacity = Some(opacity);
    settings::save(&state.dir, &s).map_err(|e| e.to_string())
}

fn start_watcher(app: &AppHandle, state: &AppState, log_path: &str) {
    let mut w = state.watcher.lock().unwrap();
    if let Some(old) = w.take() {
        old.store(true, Ordering::Relaxed);
    }
    *w = Some(log_watcher::spawn_watcher(app.clone(), PathBuf::from(log_path)));
}

#[tauri::command]
fn set_log_path(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    {
        let mut s = state.settings.lock().unwrap();
        s.log_path = path.clone();
        settings::save(&state.dir, &s).map_err(|e| e.to_string())?;
    }
    start_watcher(&app, &state, &path);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            let settings = settings::load(&dir);
            let log_path = settings.log_path.clone();
            if let (Some(x), Some(y), Some(w)) =
                (settings.window_x, settings.window_y, app.get_webview_window("main"))
            {
                let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            }
            app.manage(AppState { dir, settings: Mutex::new(settings), watcher: Mutex::new(None) });
            start_watcher(app.handle(), &app.state::<AppState>(), &log_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            read_text_file,
            pick_guide_file,
            pick_log_file,
            set_guide_path,
            set_log_path,
            save_window_position,
            set_opacity
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
