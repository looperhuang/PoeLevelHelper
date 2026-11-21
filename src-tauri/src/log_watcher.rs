use regex::Regex;
use serde::Serialize;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn zone_regexes() -> &'static [Regex; 2] {
    static RE: OnceLock<[Regex; 2]> = OnceLock::new();
    // Anchored to the system-message prefix "] : " so chat lines quoting the text don't match.
    RE.get_or_init(|| {
        [
            Regex::new(r"\] : (?:<<set:\w+>>)*你已進入：(.+?)。$").unwrap(),
            Regex::new(r"\] : (?:<<set:\w+>>)*You have entered (.+?)\.$").unwrap(),
        ]
    })
}

/// Returns the zone name if the log line is an "entered zone" message (zh-TW or English).
pub fn parse_zone(line: &str) -> Option<String> {
    zone_regexes()
        .iter()
        .find_map(|re| re.captures(line).map(|c| c[1].to_string()))
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct AreaInfo {
    pub level: u32,
    pub act: Option<u32>,
}

/// Parses `Generating level 34 area "1_4_2"`: area level, and the act from ids like `<part>_<act>_...`.
pub fn parse_area(line: &str) -> Option<AreaInfo> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r#"Generating level (\d+) area "([^"]+)""#).unwrap());
    let c = re.captures(line)?;
    let level = c[1].parse().ok()?;
    let act = c[2].split('_').nth(1).and_then(|a| a.parse().ok());
    Some(AreaInfo { level, act })
}

const HEAD_LEN: usize = 64;

/// Reads only data appended after `open_at_end`; never scans history (Client.txt can be 100+ MB).
pub struct Tailer {
    path: PathBuf,
    offset: u64,
    pending: Vec<u8>,
    /// First bytes of the file; if they change, the file was replaced (rotation).
    head: Vec<u8>,
}

fn read_head(f: &mut File) -> io::Result<Vec<u8>> {
    let mut head = Vec::with_capacity(HEAD_LEN);
    f.seek(SeekFrom::Start(0))?;
    f.take(HEAD_LEN as u64).read_to_end(&mut head)?;
    Ok(head)
}

impl Tailer {
    pub fn open_at_end(path: &Path) -> io::Result<Tailer> {
        let mut f = File::open(path)?;
        let offset = f.metadata()?.len();
        let head = read_head(&mut f)?;
        Ok(Tailer { path: path.to_path_buf(), offset, pending: Vec::new(), head })
    }

    /// Returns newly appended complete lines; a trailing partial line is kept for the next poll.
    pub fn poll(&mut self) -> io::Result<Vec<String>> {
        let mut f = File::open(&self.path)?;
        let len = f.metadata()?.len();
        let head = read_head(&mut f)?;
        let replaced = !head.starts_with(&self.head);
        if len < self.offset || replaced {
            self.offset = 0; // truncated or rotated
            self.pending.clear();
        }
        self.head = head;
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

#[derive(Serialize, Clone, Debug)]
pub struct LogStatus {
    pub ok: bool,
    pub message: String,
}

pub enum WatchEvent {
    Zone(String),
    Area(AreaInfo),
    Status(LogStatus),
}

const STALE_DAYS: u64 = 7;

/// A log untouched for a week is probably an old install, not the game being played.
fn stale_hint(path: &Path) -> Option<String> {
    let age = std::fs::metadata(path).ok()?.modified().ok()?.elapsed().ok()?;
    let days = age.as_secs() / 86_400;
    (days >= STALE_DAYS).then(|| {
        format!("日誌已 {days} 天未更新，若遊戲裝在別處請按 Ctrl+Alt+L 重新選擇（目前：{}）", path.display())
    })
}

/// Watch loop. Errors (missing file, read failure) are re-reported every iteration so a
/// listener that subscribes late still sees them; recovery is reported once. Nothing is
/// emitted after `stop` is set, so a replaced watcher can't overwrite the new one's status.
pub fn run_watcher(path: &Path, stop: &AtomicBool, interval: Duration, emit: &mut dyn FnMut(WatchEvent)) {
    let mut tailer: Option<Tailer> = None;
    let mut ok = false;
    let mut hinted = false;
    while !stop.load(Ordering::Relaxed) {
        let result = match tailer.as_mut() {
            Some(t) => t.poll(),
            None => Tailer::open_at_end(path).map(|t| {
                tailer = Some(t);
                Vec::new()
            }),
        };
        if stop.load(Ordering::Relaxed) {
            return;
        }
        match result {
            Ok(lines) => {
                if !ok {
                    ok = true;
                    let message = stale_hint(path).unwrap_or_default();
                    hinted = !message.is_empty();
                    emit(WatchEvent::Status(LogStatus { ok: true, message }));
                } else if hinted && !lines.is_empty() {
                    hinted = false; // the game is writing to this log after all
                    emit(WatchEvent::Status(LogStatus { ok: true, message: String::new() }));
                }
                for l in &lines {
                    if let Some(a) = parse_area(l) {
                        emit(WatchEvent::Area(a));
                    } else if let Some(z) = parse_zone(l) {
                        emit(WatchEvent::Zone(z));
                    }
                }
            }
            Err(e) => {
                ok = false;
                let message = format!("讀不到日誌 {}: {e}", path.display());
                emit(WatchEvent::Status(LogStatus { ok: false, message }));
            }
        }
        std::thread::sleep(interval);
    }
}

/// Runs `run_watcher` on a background thread, forwarding events to the frontend
/// (`zone-entered`: String, `area-info`: AreaInfo, `log-status`: LogStatus). Set the returned flag to stop it.
/// `last` keeps the latest status so a frontend that subscribes late can still ask for it.
pub fn spawn_watcher(app: AppHandle, path: PathBuf, last: Arc<Mutex<Option<LogStatus>>>) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    std::thread::spawn(move || {
        run_watcher(&path, &flag, Duration::from_millis(500), &mut |ev| {
            let _ = match ev {
                WatchEvent::Zone(z) => app.emit("zone-entered", z),
                WatchEvent::Area(a) => app.emit("area-info", a),
                WatchEvent::Status(s) => {
                    *last.lock().unwrap() = Some(s.clone());
                    app.emit("log-status", s)
                }
            };
        })
    });
    stop
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

    #[test]
    fn ignores_chat_messages_that_quote_zone_text() {
        let a = "2023/11/09 00:24:09 1 cffb0716 [INFO Client 12140] #某人: 你已進入：獅眼守望。";
        let b = "2023/11/09 00:24:09 1 cffb0716 [INFO Client 12140] @來自 someone: You have entered Lioneye's Watch.";
        assert_eq!(parse_zone(a), None);
        assert_eq!(parse_zone(b), None);
    }

    #[test]
    fn detects_rotation_even_when_new_file_is_larger() {
        let f = tempfile::NamedTempFile::new().unwrap();
        append(f.path(), "2023 old\n");
        let mut t = Tailer::open_at_end(f.path()).unwrap();
        std::fs::write(f.path(), "2026 new first line that is longer\nsecond\n").unwrap();
        assert_eq!(t.poll().unwrap(), vec!["2026 new first line that is longer", "second"]);
    }

    fn run_bg(path: PathBuf) -> (Arc<AtomicBool>, Arc<std::sync::Mutex<Vec<String>>>, std::thread::JoinHandle<()>) {
        let stop = Arc::new(AtomicBool::new(false));
        let ev = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (s, e) = (stop.clone(), ev.clone());
        let h = std::thread::spawn(move || {
            run_watcher(&path, &s, Duration::from_millis(10), &mut |x| {
                e.lock().unwrap().push(match x {
                    WatchEvent::Zone(z) => format!("zone:{z}"),
                    WatchEvent::Status(st) => format!("ok:{}", st.ok),
                    WatchEvent::Area(ar) => format!("area:{}", ar.level),
                })
            })
        });
        (stop, ev, h)
    }

    #[test]
    fn stopped_watcher_emits_nothing() {
        let stop = AtomicBool::new(true);
        let mut n = 0;
        run_watcher(Path::new("Z:/missing/Client.txt"), &stop, Duration::from_millis(1), &mut |_| n += 1);
        assert_eq!(n, 0);
    }

    #[test]
    fn reports_missing_file_recovery_and_later_read_errors() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("Client.txt");
        let (stop, ev, h) = run_bg(p.clone());
        std::thread::sleep(Duration::from_millis(80));
        std::fs::write(&p, "start\n").unwrap();
        std::thread::sleep(Duration::from_millis(80));
        append(&p, "x [INFO Client 1] : 你已進入：獅眼守望。\n");
        std::thread::sleep(Duration::from_millis(80));
        std::fs::remove_file(&p).unwrap();
        std::thread::sleep(Duration::from_millis(80));
        stop.store(true, Ordering::Relaxed);
        h.join().unwrap();
        let ev = ev.lock().unwrap().clone();
        let first_ok = ev.iter().position(|x| x == "ok:true").expect("ok after file appears");
        assert_eq!(ev[0], "ok:false", "missing file reported first");
        let zone = ev.iter().position(|x| x == "zone:獅眼守望").expect("zone emitted");
        assert!(zone > first_ok);
        assert!(ev[zone..].iter().any(|x| x == "ok:false"), "read error after deletion reported");
    }

    #[test]
    fn hints_when_log_is_stale_and_clears_on_new_lines() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("Client.txt");
        std::fs::write(&p, "old\n").unwrap();
        let old = std::time::SystemTime::now() - Duration::from_secs(8 * 24 * 3600);
        std::fs::File::options().write(true).open(&p).unwrap().set_modified(old).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let msgs = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let (s, m, path) = (stop.clone(), msgs.clone(), p.clone());
        let h = std::thread::spawn(move || {
            run_watcher(&path, &s, Duration::from_millis(10), &mut |x| {
                if let WatchEvent::Status(st) = x {
                    m.lock().unwrap().push(st.message);
                }
            })
        });
        std::thread::sleep(Duration::from_millis(80));
        append(&p, "new\n");
        std::thread::sleep(Duration::from_millis(80));
        stop.store(true, Ordering::Relaxed);
        h.join().unwrap();
        let msgs = msgs.lock().unwrap().clone();
        assert!(msgs[0].contains("天未更新"), "stale hint first: {msgs:?}");
        assert_eq!(msgs.last().unwrap(), "", "hint cleared after new lines: {msgs:?}");
    }

    #[test]
    fn parses_area_level_and_act() {
        let l = r#"2026/11/21 12:10:22 8433734 1186a803 [DEBUG Client 21184] Generating level 34 area "1_4_2" with seed 2030187915"#;
        assert_eq!(parse_area(l), Some(AreaInfo { level: 34, act: Some(4) }));
        let l = r#"x [DEBUG Client 1] Generating level 68 area "2_10_town" with seed 1"#;
        assert_eq!(parse_area(l), Some(AreaInfo { level: 68, act: Some(10) }));
    }

    #[test]
    fn area_without_act_number() {
        let l = r#"x [DEBUG Client 1] Generating level 60 area "HideoutForest" with seed 1"#;
        assert_eq!(parse_area(l), Some(AreaInfo { level: 60, act: None }));
        let l = r#"x [DEBUG Client 1] Generating level 33 area "1_Labyrinth_boss_2_end" with seed 2"#;
        assert_eq!(parse_area(l), Some(AreaInfo { level: 33, act: None }));
        assert_eq!(parse_area("x : 你已進入：獅眼守望。"), None);
    }
}
