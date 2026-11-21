mod log_watcher;
mod settings;
mod game_detect;

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
    last_status: Arc<Mutex<Option<log_watcher::LogStatus>>>,
}

#[tauri::command]
fn get_log_status(state: State<AppState>) -> Option<log_watcher::LogStatus> {
    state.last_status.lock().unwrap().clone()
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
    *state.last_status.lock().unwrap() = None;
    *w = Some(log_watcher::spawn_watcher(app.clone(), PathBuf::from(log_path), state.last_status.clone()));
}

/// System-tray icon. Menu actions are forwarded to the frontend as a `tray` event
/// (payload = item id) so they reuse the same code as the hotkeys; "quit" exits here.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Emitter;
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let menu = Menu::with_items(
        app,
        &[
            &item("toggle", "顯示／隱藏疊層")?,
            &item("guide", "載入攻略…")?,
            &item("log", "選擇 Client.txt…")?,
            &item("move", "移動位置（再選一次結束）")?,
            &item("help", "快捷鍵說明")?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "結束")?,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("PoeLevelHelper")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "quit" => app.exit(0),
            id => {
                let _ = app.emit("tray", id);
            }
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                let _ = tray.app_handle().emit("tray", "toggle");
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn switch_log_path(app: &AppHandle, state: &AppState, path: String) -> Result<(), String> {
    {
        let mut s = state.settings.lock().unwrap();
        s.log_path = path.clone();
        settings::save(&state.dir, &s).map_err(|e| e.to_string())?;
    }
    start_watcher(app, state, &path);
    Ok(())
}

#[tauri::command]
fn set_log_path(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    switch_log_path(&app, &state, path)
}

/// Every 5 s: if a Path of Exile client is running from another folder than the configured
/// log, switch to that client's logs/Client.txt (the running game is the source of truth).
fn spawn_game_detector(app: AppHandle) {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    std::thread::spawn(move || {
        let Ok(mut sys) = System::new() else {
            return; // process listing unavailable: keep the configured path
        };
        let kind = ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet);
        loop {
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
            let found = sys
                .processes()
                .values()
                .find_map(|p| game_detect::log_from_exe(&p.name().to_string_lossy(), p.exe()?))
                .filter(|log| log.exists());
            if let Some(log) = found {
                let log = log.to_string_lossy().into_owned();
                let state = app.state::<AppState>();
                let current = state.settings.lock().unwrap().log_path.clone();
                if !current.eq_ignore_ascii_case(&log) {
                    let _ = switch_log_path(&app, &state, log);
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
    });
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
            app.manage(AppState {
                dir,
                settings: Mutex::new(settings),
                watcher: Mutex::new(None),
                last_status: Arc::new(Mutex::new(None)),
            });
            start_watcher(app.handle(), &app.state::<AppState>(), &log_path);
            spawn_game_detector(app.handle().clone());
            build_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_log_status,
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
