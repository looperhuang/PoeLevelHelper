use std::path::{Path, PathBuf};

/// Maps a running process to its Client.txt when it is a Path of Exile client.
pub fn log_from_exe(name: &str, exe: &Path) -> Option<PathBuf> {
    let n = name.to_ascii_lowercase();
    // PathOfExile.exe, PathOfExile_x64.exe, PathOfExileSteam.exe, PathOfExile_KG.exe, ...
    if !(n.starts_with("pathofexile") && n.ends_with(".exe")) {
        return None;
    }
    Some(exe.parent()?.join("logs").join("Client.txt"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_client_names_to_logs_dir() {
        for name in ["PathOfExile.exe", "PathOfExile_x64.exe", "PathOfExileSteam.exe", "pathofexile_kg.exe"] {
            let exe = Path::new(r"E:\POE").join(name);
            assert_eq!(log_from_exe(name, &exe), Some(PathBuf::from(r"E:\POE\logs\Client.txt")), "{name}");
        }
    }

    #[test]
    fn ignores_other_processes() {
        assert_eq!(log_from_exe("poe-overlay.exe", Path::new(r"D:\x\poe-overlay.exe")), None);
        assert_eq!(log_from_exe("explorer.exe", Path::new(r"C:\Windows\explorer.exe")), None);
    }
}
