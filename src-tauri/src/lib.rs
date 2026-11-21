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

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("無法讀取 {path}: {e}"))
}

async fn pick(app: AppHandle, name: &str, ext: &str) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(name, &[ext])
        .blocking_pick_file()
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
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            let settings = settings::load(&dir);
            let log_path = settings.log_path.clone();
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
            set_log_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
