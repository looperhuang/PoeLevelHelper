use regex::Regex;
use serde::Serialize;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn zone_regexes() -> &'static [Regex; 2] {
    static RE: OnceLock<[Regex; 2]> = OnceLock::new();
    RE.get_or_init(|| {
        [
            Regex::new(r"你已進入：(.+?)。").unwrap(),
            Regex::new(r"You have entered (.+?)\.").unwrap(),
        ]
    })
}

/// Returns the zone name if the log line is an "entered zone" message (zh-TW or English).
pub fn parse_zone(line: &str) -> Option<String> {
    zone_regexes()
        .iter()
        .find_map(|re| re.captures(line).map(|c| c[1].to_string()))
}

/// Reads only data appended after `open_at_end`; never scans history (Client.txt can be 100+ MB).
pub struct Tailer {
    path: PathBuf,
    offset: u64,
    pending: Vec<u8>,
}

impl Tailer {
    pub fn open_at_end(path: &Path) -> io::Result<Tailer> {
        let offset = File::open(path)?.metadata()?.len();
        Ok(Tailer { path: path.to_path_buf(), offset, pending: Vec::new() })
    }

    /// Returns newly appended complete lines; a trailing partial line is kept for the next poll.
    pub fn poll(&mut self) -> io::Result<Vec<String>> {
        let mut f = File::open(&self.path)?;
        let len = f.metadata()?.len();
        if len < self.offset {
            self.offset = 0; // truncated or rotated
            self.pending.clear();
        }
        f.seek(SeekFrom::Start(self.offset))?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf)?;
        self.offset += buf.len() as u64;
        self.pending.extend_from_slice(&buf);
        let mut lines = Vec::new();
        while let Some(i) = self.pending.iter().position(|&b| b == b'\n') {
            let raw: Vec<u8> = self.pending.drain(..=i).collect();
            lines.push(String::from_utf8_lossy(&raw).trim_end_matches(['\r', '\n']).to_string());
        }
        Ok(lines)
    }
}

#[derive(Serialize, Clone)]
pub struct LogStatus {
    pub ok: bool,
    pub message: String,
}

/// Background thread: emits `zone-entered` (String) and `log-status` (LogStatus).
/// If the file cannot be opened it reports once and retries every 2 s.
pub fn spawn_watcher(app: AppHandle, path: PathBuf) {
    std::thread::spawn(move || {
        let mut tailer = loop {
            match Tailer::open_at_end(&path) {
                Ok(t) => {
                    let _ = app.emit("log-status", LogStatus { ok: true, message: String::new() });
                    break t;
                }
                Err(e) => {
                    let _ = app.emit(
                        "log-status",
                        LogStatus { ok: false, message: format!("找不到日誌 {}: {e}", path.display()) },
                    );
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        };
        loop {
            if let Ok(lines) = tailer.poll() {
                for zone in lines.iter().filter_map(|l| parse_zone(l)) {
                    let _ = app.emit("zone-entered", zone);
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;
    use std::io::Write;

    fn append(p: &Path, s: &str) {
        let mut f = OpenOptions::new().append(true).open(p).unwrap();
        f.write_all(s.as_bytes()).unwrap();
    }

    #[test]
    fn parses_traditional_chinese_zone() {
        let l = "2023/11/09 00:23:31 709937640 cffb0716 [INFO Client 12140] : <<set:MS>><<set:M>><<set:S>>你已進入：藏身處 - 富饒之地。";
        assert_eq!(parse_zone(l), Some("藏身處 - 富饒之地".to_string()));
    }

    #[test]
    fn parses_english_zone() {
        let l = "2023/11/09 00:23:31 1 cffb0716 [INFO Client 1] : You have entered Lioneye's Watch.";
        assert_eq!(parse_zone(l), Some("Lioneye's Watch".to_string()));
    }

    #[test]
    fn ignores_player_joined_line() {
        let l = "2023/11/09 00:23:32 709938000 cffb0716 [INFO Client 12140] : tasteslikeburnt 進入了此區域。";
        assert_eq!(parse_zone(l), None);
    }

    #[test]
    fn starts_at_end_and_joins_partial_lines() {
        let f = tempfile::NamedTempFile::new().unwrap();
        append(f.path(), "old history\n");
        let mut t = Tailer::open_at_end(f.path()).unwrap();
        assert_eq!(t.offset, 12, "must start at file end, not read history");
        assert!(t.poll().unwrap().is_empty());
        append(f.path(), "a\nb");
        assert_eq!(t.poll().unwrap(), vec!["a"]);
        append(f.path(), "c\r\n");
        assert_eq!(t.poll().unwrap(), vec!["bc"]);
    }

    #[test]
    fn recovers_after_truncation() {
        let f = tempfile::NamedTempFile::new().unwrap();
        append(f.path(), "0123456789\n");
        let mut t = Tailer::open_at_end(f.path()).unwrap();
        std::fs::write(f.path(), "x\n").unwrap();
        assert_eq!(t.poll().unwrap(), vec!["x"]);
        append(f.path(), "y\n");
        assert_eq!(t.poll().unwrap(), vec!["y"]);
    }
}
