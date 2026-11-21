use serde::{Deserialize, Serialize};
use std::io;
use std::path::Path;

pub const DEFAULT_LOG_PATH: &str =
    r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Settings {
    pub log_path: String,
    pub guide_path: Option<String>,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { log_path: DEFAULT_LOG_PATH.to_string(), guide_path: None, window_x: None, window_y: None }
    }
}

const FILE: &str = "settings.json";

/// Missing or corrupt file yields defaults; never panics.
pub fn load(dir: &Path) -> Settings {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, s: &Settings) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(FILE), serde_json::to_string_pretty(s)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_missing_dir_gives_default() {
        assert_eq!(load(Path::new("Z:/definitely/not/here")), Settings::default());
    }

    #[test]
    fn load_corrupt_file_gives_default() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("settings.json"), "{ not json").unwrap();
        assert_eq!(load(d.path()), Settings::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let d = tempfile::tempdir().unwrap();
        let s = Settings { log_path: "x".into(), guide_path: Some("g.json".into()), window_x: Some(5), window_y: None };
        save(d.path(), &s).unwrap();
        assert_eq!(load(d.path()), s);
    }
}
